import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
  kafkaClientId: process.env.KAFKA_CLIENT_ID ?? "streambridge-worker",
  chunksTopic: process.env.KAFKA_CHUNKS_TOPIC ?? "file-transfer-chunks",
  dataDir: process.env.DATA_DIR ?? "./apps/api/data",
  defaultChunkSize: toNumber(process.env.CHUNK_SIZE_BYTES, 512 * 1024)
};
