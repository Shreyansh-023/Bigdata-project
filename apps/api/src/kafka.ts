import { Kafka, Partitioners } from "kafkajs";
import { config } from "./config.js";

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers
});

export const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  idempotent: true,
  maxInFlightRequests: 1,
  retry: { retries: 8 }
});

export const connectKafka = async (): Promise<void> => {
  await producer.connect();
};
