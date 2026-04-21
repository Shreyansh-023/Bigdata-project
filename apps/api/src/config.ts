import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  apiPort: toNumber(process.env.API_PORT, 4000),
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  kafkaClientId: process.env.KAFKA_CLIENT_ID ?? "streambridge-api",
  kafkaTopics: {
    metadata: process.env.KAFKA_METADATA_TOPIC ?? "file-transfer-metadata",
    chunks: process.env.KAFKA_CHUNKS_TOPIC ?? "file-transfer-chunks",
    events: process.env.KAFKA_EVENTS_TOPIC ?? "file-transfer-events",
    metrics: process.env.KAFKA_METRICS_TOPIC ?? "file-transfer-metrics",
    chunkHints: process.env.KAFKA_CHUNK_HINTS_TOPIC ?? "file-transfer-chunk-hints"
  },
  hintsConsumerGroup:
    process.env.KAFKA_HINTS_CONSUMER_GROUP ?? `streambridge-api-hints-${Date.now()}`,
  defaultChunkSize: toNumber(process.env.CHUNK_SIZE_BYTES, 512 * 1024),
  uploadDir: process.env.UPLOAD_DIR ?? "./apps/api/uploads",
  dataDir: process.env.DATA_DIR ?? "./apps/api/data"
};
