export type TransferStatus =
  | "idle"
  | "running"
  | "paused"
  | "retrying"
  | "completed"
  | "failed";

export interface TransferSession {
  id: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  status: TransferStatus;
  senderId: string;
  receiverId: string;
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkMessage {
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkSize: number;
  payloadBase64: string;
  payloadSize: number;
  payloadChecksum: string;
  fileChecksum: string;
  fileName: string;
  createdAt: string;
}

export interface TransferEvent {
  transferId: string;
  type:
    | "started"
    | "chunk_published"
    | "chunk_consumed"
    | "retry"
    | "resend"
    | "completed"
    | "failed"
    | "resumed";
  message: string;
  chunkIndex?: number;
  timestamp: string;
}

export interface TransferMetric {
  transferId: string;
  throughput: number;
  latency: number;
  consumerLag: number;
  retryCount: number;
  errorCount: number;
  timestamp: string;
}

export interface TransferRuntimeStatus {
  transferId: string;
  status: TransferStatus;
  sentChunks: number;
  receivedChunks: number;
  totalChunks: number;
  bytesTransferred: number;
  fileSize: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  retryCount: number;
  error?: string;
  checksumVerified?: boolean;
  updatedAt: string;
}
