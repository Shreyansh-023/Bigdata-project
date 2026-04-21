import { Kafka, Partitioners } from "kafkajs";
import { ChunkSizeHint } from "@streambridge/shared";
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

let latestHint: ChunkSizeHint | null = null;

export const getLatestHint = (): ChunkSizeHint | null => latestHint;

const hintsConsumer = kafka.consumer({ groupId: config.hintsConsumerGroup });

export const connectKafka = async (): Promise<void> => {
  await producer.connect();

  await hintsConsumer.connect();
  await hintsConsumer.subscribe({ topic: config.kafkaTopics.chunkHints, fromBeginning: false });
  await hintsConsumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }
      try {
        latestHint = JSON.parse(message.value.toString("utf-8")) as ChunkSizeHint;
      } catch {
        // ignore malformed hint
      }
    }
  });
};
