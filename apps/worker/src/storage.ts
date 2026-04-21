import fs from "node:fs";
import path from "node:path";
import { TransferRuntimeStatus, TransferSession } from "@streambridge/shared";
import { config } from "./config.js";

export const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const transferDir = (transferId: string): string =>
  path.join(config.dataDir, "transfers", transferId);

export const metadataPath = (transferId: string): string =>
  path.join(transferDir(transferId), "metadata.json");

export const statusPath = (transferId: string): string =>
  path.join(transferDir(transferId), "status.json");

export const outputPath = (transferId: string, fileName: string): string => {
  const outDir = path.join(transferDir(transferId), "output");
  ensureDir(outDir);
  return path.join(outDir, fileName);
};

export const readJson = <T>(filePath: string): T | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
};

export const writeJson = <T>(filePath: string, value: T): void => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
};

export const readMetadata = (transferId: string): TransferSession | null =>
  readJson<TransferSession>(metadataPath(transferId));

export const requireSession = (transferId: string): TransferSession => {
  const session = readMetadata(transferId);
  if (!session) {
    throw new Error(`Missing metadata for transfer ${transferId}`);
  }

  return session;
};

export const readStatus = (transferId: string): TransferRuntimeStatus | null =>
  readJson<TransferRuntimeStatus>(statusPath(transferId));
