import fs from "node:fs";
import { Kafka } from "kafkajs";
import { ChunkMessage, TransferRuntimeStatus } from "@streambridge/shared";
import { config } from "./config.js";
import {
  outputPath,
  readStatus,
  requireSession,
  statusPath,
  writeJson
} from "./storage.js";
import { sha256Buffer, sha256File } from "./checksum.js";

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers
});

const consumer = kafka.consumer({ groupId: "streambridge-reassembler-v1" });

const received = new Map<string, Set<number>>();

const nowIso = (): string => new Date().toISOString();

const updateStatus = (
  transferId: string,
  patch: Partial<TransferRuntimeStatus>
): TransferRuntimeStatus => {
  const current = readStatus(transferId);
  if (!current) {
    throw new Error(`Missing status for ${transferId}`);
  }

  const merged: TransferRuntimeStatus = {
    ...current,
    ...patch,
    updatedAt: nowIso()
  };

  writeJson(statusPath(transferId), merged);
  return merged;
};

const reconstructChunk = async (chunk: ChunkMessage): Promise<void> => {
  const session = requireSession(chunk.transferId);
  const payload = Buffer.from(chunk.payloadBase64, "base64");

  if (sha256Buffer(payload) !== chunk.payloadChecksum) {
    updateStatus(chunk.transferId, {
      status: "failed",
      error: `Checksum mismatch for chunk ${chunk.chunkIndex}`
    });
    throw new Error(`Invalid chunk checksum for transfer ${chunk.transferId}`);
  }

  const outPath = outputPath(chunk.transferId, session.fileName);
  const fd = fs.openSync(outPath, "a+");

  try {
    const offset = chunk.chunkIndex * session.chunkSize;
    fs.writeSync(fd, payload, 0, payload.length, offset);
  } finally {
    fs.closeSync(fd);
  }

  const bucket = received.get(chunk.transferId) ?? new Set<number>();
  bucket.add(chunk.chunkIndex);
  received.set(chunk.transferId, bucket);

  const count = bucket.size;
  const status = updateStatus(chunk.transferId, {
    status: "running",
    receivedChunks: count,
    bytesTransferred: Math.min(count * session.chunkSize, session.fileSize)
  });

  if (count >= chunk.totalChunks) {
    const finalChecksum = await sha256File(outPath);
    const checksumVerified = finalChecksum === chunk.fileChecksum;

    updateStatus(chunk.transferId, {
      status: checksumVerified ? "completed" : "failed",
      checksumVerified,
      error: checksumVerified
        ? undefined
        : `Final checksum mismatch expected=${chunk.fileChecksum} actual=${finalChecksum}`,
      receivedChunks: chunk.totalChunks,
      sentChunks: status.sentChunks
    });
  }
};

const run = async (): Promise<void> => {
  await consumer.connect();
  await consumer.subscribe({ topic: config.chunksTopic, fromBeginning: true });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) {
        return;
      }

      const payload = JSON.parse(message.value.toString("utf-8")) as ChunkMessage;

      await reconstructChunk(payload);

      const nextOffset = (BigInt(message.offset) + 1n).toString();
      await consumer.commitOffsets([
        {
          topic,
          partition,
          offset: nextOffset
        }
      ]);
    }
  });

  // eslint-disable-next-line no-console
  console.log("Worker started and consuming chunks");
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Worker fatal error", error);
  process.exit(1);
});
