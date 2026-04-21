import dotenv from "dotenv";
import express from "express";
import { Kafka } from "kafkajs";

dotenv.config({ path: ".env" });

const app = express();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID ?? "streambridge-analytics",
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",")
});

const consumer = kafka.consumer({ groupId: "streambridge-analytics-v1" });
const metricsTopic = process.env.KAFKA_METRICS_TOPIC ?? "file-transfer-metrics";
const eventsTopic = process.env.KAFKA_EVENTS_TOPIC ?? "file-transfer-events";
const port = Number(process.env.ANALYTICS_PORT ?? 4100);

const byTransfer = new Map<string, unknown>();
const recentEvents: unknown[] = [];

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "analytics", size: byTransfer.size });
});

app.get("/api/analytics/metrics", (_req, res) => {
  res.json({ items: Object.fromEntries(byTransfer) });
});

app.get("/api/analytics/events", (_req, res) => {
  res.json({ items: recentEvents.slice(-200) });
});

const run = async (): Promise<void> => {
  await consumer.connect();
  await consumer.subscribe({ topic: metricsTopic, fromBeginning: true });
  await consumer.subscribe({ topic: eventsTopic, fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) {
        return;
      }

      const parsed = JSON.parse(message.value.toString("utf-8"));
      if (topic === metricsTopic) {
        const transferId = parsed.transferId ?? "unknown";
        byTransfer.set(transferId, parsed);
      } else {
        recentEvents.push(parsed);
        if (recentEvents.length > 200) {
          recentEvents.shift();
        }
      }
    }
  });

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Analytics listening on ${port}`);
  });
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Analytics fatal error", error);
  process.exit(1);
});
