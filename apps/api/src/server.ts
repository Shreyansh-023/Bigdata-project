import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import multer from "multer";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import {
  ChunkMessage,
  TransferEvent,
  TransferMetric,
  TransferRuntimeStatus,
  TransferSession
} from "@streambridge/shared";
import { config } from "./config.js";
import { connectKafka, getLatestHint, producer } from "./kafka.js";
import {
  appendLine,
  ensureDir,
  eventsPath,
  metadataPath,
  readJson,
  statusPath,
  transferDir,
  writeJson
} from "./storage.js";
import { sha256Buffer, sha256File } from "./checksum.js";

ensureDir(config.uploadDir);
ensureDir(config.dataDir);

const upload = multer({ dest: config.uploadDir });
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const broadcast = (payload: unknown): void => {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
};

const nowIso = (): string => new Date().toISOString();

const readStatus = (transferId: string): TransferRuntimeStatus | null =>
  readJson<TransferRuntimeStatus>(statusPath(transferId));

const updateStatus = (
  transferId: string,
  patch: Partial<TransferRuntimeStatus>
): TransferRuntimeStatus => {
  const current = readStatus(transferId);
  if (!current) {
    throw new Error(`Unknown transfer: ${transferId}`);
  }

  const merged: TransferRuntimeStatus = {
    ...current,
    ...patch,
    updatedAt: nowIso()
  };

  writeJson(statusPath(transferId), merged);
  broadcast({ type: "status", transferId, data: merged });
  return merged;
};

const emitEvent = async (event: TransferEvent): Promise<void> => {
  appendLine(eventsPath(event.transferId), event);
  broadcast({ type: "event", transferId: event.transferId, data: event });

  await producer.send({
    topic: config.kafkaTopics.events,
    messages: [{ key: event.transferId, value: JSON.stringify(event) }]
  });
};

const emitMetric = async (metric: TransferMetric): Promise<void> => {
  broadcast({ type: "metric", transferId: metric.transferId, data: metric });
  await producer.send({
    topic: config.kafkaTopics.metrics,
    messages: [{ key: metric.transferId, value: JSON.stringify(metric) }]
  });
};

const listTransfers = (): string[] => {
  const root = path.join(config.dataDir, "transfers");
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "api", timestamp: nowIso() });
});

app.get("/api/predictor/hint", (_req, res) => {
  const hint = getLatestHint();
  if (!hint) {
    return res.status(404).json({ error: "no hint available yet" });
  }
  return res.json(hint);
});

app.get("/api/transfers", (_req, res) => {
  const items = listTransfers()
    .map((id) => readJson<TransferSession>(metadataPath(id)))
    .filter((x): x is TransferSession => Boolean(x));

  res.json({ items });
});

app.post("/api/transfers", async (req, res) => {
  const { fileName, fileSize, chunkSize, senderId, receiverId } = req.body as {
    fileName?: string;
    fileSize?: number;
    chunkSize?: number;
    senderId?: string;
    receiverId?: string;
  };

  if (!fileName || !fileSize || fileSize <= 0) {
    return res.status(400).json({ error: "fileName and fileSize are required" });
  }

  const hint = getLatestHint();
  const predictorSize = hint?.recommendedChunkSize;
  const size =
    chunkSize && chunkSize > 0
      ? chunkSize
      : predictorSize && predictorSize > 0
        ? predictorSize
        : config.defaultChunkSize;
  const transferId = crypto
    .createHash("sha1")
    .update(`${fileName}:${fileSize}:${nowIso()}:${uuidv4()}`)
    .digest("hex")
    .slice(0, 16);

  const totalChunks = Math.ceil(fileSize / size);

  const session: TransferSession = {
    id: transferId,
    fileName,
    fileSize,
    chunkSize: size,
    totalChunks,
    status: "idle",
    senderId: senderId ?? "sender-local",
    receiverId: receiverId ?? "receiver-local",
    checksum: "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const status: TransferRuntimeStatus = {
    transferId,
    status: "idle",
    sentChunks: 0,
    receivedChunks: 0,
    totalChunks,
    bytesTransferred: 0,
    fileSize,
    speedBytesPerSec: 0,
    etaSeconds: 0,
    retryCount: 0,
    updatedAt: nowIso()
  };

  writeJson(metadataPath(transferId), session);
  writeJson(statusPath(transferId), status);

  await producer.send({
    topic: config.kafkaTopics.metadata,
    messages: [{ key: transferId, value: JSON.stringify(session) }]
  });

  await emitEvent({
    transferId,
    type: "started",
    message: "Transfer session created",
    timestamp: nowIso()
  });

  return res.status(201).json({ transferId, session, status });
});

app.post("/api/transfers/:id/file", upload.single("file"), async (req, res) => {
  const transferId = req.params.id;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "file is required" });
  }

  const session = readJson<TransferSession>(metadataPath(transferId));
  if (!session) {
    fs.unlinkSync(file.path);
    return res.status(404).json({ error: "transfer not found" });
  }

  if (file.size <= 0) {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: "empty file is not allowed" });
  }

  const startedAt = Date.now();
  const originalChecksum = await sha256File(file.path);
  session.checksum = originalChecksum;
  session.status = "running";
  session.updatedAt = nowIso();
  writeJson(metadataPath(transferId), session);

  const transferBase = transferDir(transferId);
  const originalDir = path.join(transferBase, "original");
  ensureDir(originalDir);
  const originalPath = path.join(originalDir, session.fileName);
  fs.copyFileSync(file.path, originalPath);
  fs.unlinkSync(file.path);

  await updateStatus(transferId, {
    status: "running",
    bytesTransferred: 0,
    sentChunks: 0,
    error: undefined
  });

  const fd = fs.openSync(originalPath, "r");
  let chunkIndex = 0;

  try {
    while (chunkIndex < session.totalChunks) {
      const remaining = session.fileSize - chunkIndex * session.chunkSize;
      const currentSize = Math.min(session.chunkSize, remaining);
      const buffer = Buffer.allocUnsafe(currentSize);
      const offset = chunkIndex * session.chunkSize;

      fs.readSync(fd, buffer, 0, currentSize, offset);

      const msg: ChunkMessage = {
        transferId,
        chunkIndex,
        totalChunks: session.totalChunks,
        chunkSize: session.chunkSize,
        payloadBase64: buffer.toString("base64"),
        payloadSize: currentSize,
        payloadChecksum: sha256Buffer(buffer),
        fileChecksum: originalChecksum,
        fileName: session.fileName,
        createdAt: nowIso()
      };

      await producer.send({
        topic: config.kafkaTopics.chunks,
        messages: [{ key: transferId, value: JSON.stringify(msg) }]
      });

      await emitEvent({
        transferId,
        type: "chunk_published",
        message: `Published chunk ${chunkIndex}/${session.totalChunks - 1}`,
        chunkIndex,
        timestamp: nowIso()
      });

      const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.001);
      const sentBytes = Math.min((chunkIndex + 1) * session.chunkSize, session.fileSize);
      const speed = sentBytes / elapsedSec;
      const remainingBytes = session.fileSize - sentBytes;

      await updateStatus(transferId, {
        sentChunks: chunkIndex + 1,
        bytesTransferred: sentBytes,
        speedBytesPerSec: speed,
        etaSeconds: Math.ceil(remainingBytes / Math.max(speed, 1))
      });

      await emitMetric({
        transferId,
        throughput: speed,
        latency: 0,
        consumerLag: session.totalChunks - (chunkIndex + 1),
        retryCount: 0,
        errorCount: 0,
        timestamp: nowIso()
      });

      chunkIndex += 1;
    }

    await emitEvent({
      transferId,
      type: "started",
      message: "All chunks published",
      timestamp: nowIso()
    });

    return res.json({
      ok: true,
      transferId,
      totalChunks: session.totalChunks,
      checksum: originalChecksum
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown upload error";
    await updateStatus(transferId, { status: "failed", error: message });
    await emitEvent({
      transferId,
      type: "failed",
      message,
      timestamp: nowIso()
    });
    return res.status(500).json({ error: message });
  } finally {
    fs.closeSync(fd);
  }
});

app.get("/api/transfers/:id/status", (req, res) => {
  const transferId = req.params.id;
  const data = readStatus(transferId);
  if (!data) {
    return res.status(404).json({ error: "transfer not found" });
  }

  return res.json(data);
});

app.get("/api/transfers/:id/metrics", (_req, res) => {
  const transferId = _req.params.id;
  const state = readStatus(transferId);
  if (!state) {
    return res.status(404).json({ error: "transfer not found" });
  }

  return res.json({
    transferId,
    throughput: state.speedBytesPerSec,
    retryCount: state.retryCount,
    progressPct: Number(((state.sentChunks / Math.max(state.totalChunks, 1)) * 100).toFixed(2)),
    updatedAt: state.updatedAt
  });
});

app.post("/api/transfers/:id/resume", async (req, res) => {
  const transferId = req.params.id;
  const session = readJson<TransferSession>(metadataPath(transferId));
  if (!session) {
    return res.status(404).json({ error: "transfer not found" });
  }

  const state = readStatus(transferId);
  if (!state) {
    return res.status(404).json({ error: "status not found" });
  }

  const requested = req.body?.missingChunks as number[] | undefined;
  const missingChunks =
    requested && requested.length > 0
      ? requested.filter((v) => Number.isInteger(v) && v >= 0 && v < session.totalChunks)
      : Array.from({ length: session.totalChunks - state.sentChunks }, (_, i) =>
          state.sentChunks + i
        );

  if (missingChunks.length === 0) {
    return res.json({ ok: true, message: "no missing chunks" });
  }

  const filePath = path.join(transferDir(transferId), "original", session.fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(400).json({
      error: "original file missing, cannot resume. Re-upload required"
    });
  }

  const fd = fs.openSync(filePath, "r");
  try {
    for (const chunkIndex of missingChunks) {
      const remaining = session.fileSize - chunkIndex * session.chunkSize;
      const currentSize = Math.min(session.chunkSize, remaining);
      const buffer = Buffer.allocUnsafe(currentSize);
      const offset = chunkIndex * session.chunkSize;
      fs.readSync(fd, buffer, 0, currentSize, offset);

      const msg: ChunkMessage = {
        transferId,
        chunkIndex,
        totalChunks: session.totalChunks,
        chunkSize: session.chunkSize,
        payloadBase64: buffer.toString("base64"),
        payloadSize: currentSize,
        payloadChecksum: sha256Buffer(buffer),
        fileChecksum: session.checksum,
        fileName: session.fileName,
        createdAt: nowIso()
      };

      await producer.send({
        topic: config.kafkaTopics.chunks,
        messages: [{ key: transferId, value: JSON.stringify(msg) }]
      });

      await emitEvent({
        transferId,
        type: "resend",
        message: `Resent chunk ${chunkIndex}`,
        chunkIndex,
        timestamp: nowIso()
      });
    }

    await updateStatus(transferId, {
      status: "retrying",
      retryCount: state.retryCount + 1
    });

    await emitEvent({
      transferId,
      type: "resumed",
      message: `Resumed transfer with ${missingChunks.length} chunks`,
      timestamp: nowIso()
    });

    return res.json({ ok: true, transferId, resentChunks: missingChunks.length });
  } finally {
    fs.closeSync(fd);
  }
});

app.get("/api/transfers/:id/download", (req, res) => {
  const transferId = req.params.id;
  const session = readJson<TransferSession>(metadataPath(transferId));
  if (!session) {
    return res.status(404).json({ error: "transfer not found" });
  }

  const filePath = path.join(transferDir(transferId), "output", session.fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "reconstructed file not available yet" });
  }

  return res.download(filePath);
});

app.get("/api/transfers/:id/events", (req, res) => {
  const filePath = eventsPath(req.params.id);
  if (!fs.existsSync(filePath)) {
    return res.json({ items: [] });
  }

  const items = fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return res.json({ items });
});

const run = async (): Promise<void> => {
  await connectKafka();
  server.listen(config.apiPort, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on ${config.apiPort}`);
  });
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal API startup error", error);
  process.exit(1);
});
