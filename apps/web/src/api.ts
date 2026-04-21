const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export interface TransferSession {
  id: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  status: string;
  checksum: string;
  createdAt: string;
}

export const apiBase = API_BASE;

export const createTransfer = async (payload: {
  fileName: string;
  fileSize: number;
  chunkSize: number;
}) => {
  const res = await fetch(`${API_BASE}/api/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return await res.json();
};

export const uploadFile = async (transferId: string, file: File) => {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/transfers/${transferId}/file`, {
    method: "POST",
    body: form
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return await res.json();
};

export const listTransfers = async (): Promise<{ items: TransferSession[] }> => {
  const res = await fetch(`${API_BASE}/api/transfers`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return await res.json();
};

export const getEvents = async (transferId: string): Promise<{ items: unknown[] }> => {
  const res = await fetch(`${API_BASE}/api/transfers/${transferId}/events`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return await res.json();
};

export const resumeTransfer = async (transferId: string): Promise<unknown> => {
  const res = await fetch(`${API_BASE}/api/transfers/${transferId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return await res.json();
};
