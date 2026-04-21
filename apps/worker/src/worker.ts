import fs from "node:fs";
import { Kafka } from "kafkajs";
import { ChunkMessage, TransferRuntimeStatus, TransferSession } from "@streambridge/shared";
import { config } from "./config.js";
import {
  metadataPath,
  outputPath,
  readMetadata,
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

const consumer = kafka.consumer({
  groupId: config.consumerGroup,
  maxBytesPerPartition: 8 * 1024 * 1024
});

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

const waitForMetadata = async (transferId: string, maxMs = 5000): Promise<void> => {
  const start = Date.now();
  while (!readMetadata(transferId)) {
    if (Date.now() - start > maxMs) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

const persistSessionMetadata = (session: TransferSession): void => {
  writeJson(metadataPath(session.id), session);

  if (!readStatus(session.id)) {
    const initialStatus: TransferRuntimeStatus = {
      transferId: session.id,
      status: "running",
      sentChunks: 0,
      receivedChunks: 0,
      totalChunks: session.totalChunks,
      bytesTransferred: 0,
      fileSize: session.fileSize,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      retryCount: 0,
      updatedAt: nowIso()
    };
    writeJson(statusPath(session.id), initialStatus);
  }
};

const run = async (): Promise<void> => {
  await consumer.connect();
  await consumer.subscribe({
    topics: [config.metadataTopic, config.chunksTopic],
    fromBeginning: true
  });

  await consumer.run({
    autoCommit: false,
    partitionsConsumedConcurrently: 4,
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) {
        return;
      }

      if (topic === config.metadataTopic) {
        const session = JSON.parse(message.value.toString("utf-8")) as TransferSession;
        persistSessionMetadata(session);
      } else if (topic === config.chunksTopic) {
        const chunk = JSON.parse(message.value.toString("utf-8")) as ChunkMessage;
        await waitForMetadata(chunk.transferId);
        await reconstructChunk(chunk);
      }

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
