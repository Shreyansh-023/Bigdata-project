import express from "express";
import { Kafka, Partitioners } from "kafkajs";
import { ChunkSizeHint } from "@streambridge/shared";
import { config } from "./config.js";
import { EwmaWindow, MetricSample } from "./ewma.js";
import { DecisionPolicy } from "./decision.js";

const kafka = new Kafka({
  clientId: config.kafkaClientId,
  brokers: config.kafkaBrokers
});

const consumer = kafka.consumer({
  groupId: config.consumerGroup,
  maxBytesPerPartition: 8 * 1024 * 1024
});
const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner
});

const windowState = new EwmaWindow(config.ewmaAlpha);
const policy = new DecisionPolicy();
let latestHint: ChunkSizeHint | null = null;

const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "predictor" });
});

app.get("/hint", (_req, res) => {
  if (!latestHint) {
    return res.status(404).json({ error: "no hint computed yet" });
  }
  return res.json(latestHint);
});

const publishHint = async (): Promise<void> => {
  if (!windowState.hasData()) {
    return;
  }

  const features = windowState.snapshot();
  const hint = policy.decide(features, Date.now());
  latestHint = hint;

  await producer.send({
    topic: config.hintsTopic,
    messages: [{ key: "global", value: JSON.stringify(hint) }]
  });

  // eslint-disable-next-line no-console
  console.log(
    `[predictor] regime=${hint.regime} score=${hint.stabilityScore} chunk=${hint.recommendedChunkSize}`
  );
};

const run = async (): Promise<void> => {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: config.metricsTopic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }
      const sample = JSON.parse(message.value.toString("utf-8")) as MetricSample;
      windowState.ingest(sample);
    }
  });

  setInterval(() => {
    publishHint().catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[predictor] publish error", error);
    });
  }, config.decisionIntervalMs);

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Predictor listening on ${config.port}`);
  });
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Predictor fatal error", error);
  process.exit(1);
});
