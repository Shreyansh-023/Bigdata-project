import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

export const transferDir = (transferId: string): string =>
  path.join(config.dataDir, "transfers", transferId);

export const metadataPath = (transferId: string): string =>
  path.join(transferDir(transferId), "metadata.json");

export const statusPath = (transferId: string): string =>
  path.join(transferDir(transferId), "status.json");

export const eventsPath = (transferId: string): string =>
  path.join(transferDir(transferId), "events.jsonl");

export const writeJson = <T>(filePath: string, value: T): void => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
};

export const readJson = <T>(filePath: string): T | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
};

export const appendLine = (filePath: string, value: unknown): void => {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf-8");
};
