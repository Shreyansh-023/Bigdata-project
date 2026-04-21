import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toNumber(process.env.PREDICTOR_PORT, 4200),
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  kafkaClientId: process.env.KAFKA_CLIENT_ID ?? "streambridge-predictor",
  metricsTopic: process.env.KAFKA_METRICS_TOPIC ?? "file-transfer-metrics",
  hintsTopic: process.env.KAFKA_CHUNK_HINTS_TOPIC ?? "file-transfer-chunk-hints",
  consumerGroup: process.env.KAFKA_CONSUMER_GROUP ?? "streambridge-predictor-v1",
  decisionIntervalMs: toNumber(process.env.PREDICTOR_INTERVAL_MS, 10_000),
  ewmaAlpha: Number(process.env.PREDICTOR_EWMA_ALPHA ?? 0.2),
  lowStabilityChunk: toNumber(process.env.PREDICTOR_LOW_CHUNK, 64 * 1024),
  mediumStabilityChunk: toNumber(process.env.PREDICTOR_MEDIUM_CHUNK, 512 * 1024),
  highStabilityChunk: toNumber(process.env.PREDICTOR_HIGH_CHUNK, 2 * 1024 * 1024)
};
