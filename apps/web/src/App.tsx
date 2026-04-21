import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  apiBase,
  createTransfer,
  getEvents,
  getPredictorHint,
  listTransfers,
  PredictorHint,
  resumeTransfer,
  TransferSession,
  uploadFile
} from "./api";

type RuntimeStatus = {
  transferId: string;
  status: "idle" | "running" | "paused" | "retrying" | "completed" | "failed";
  sentChunks: number;
  receivedChunks: number;
  totalChunks: number;
  bytesTransferred: number;
  fileSize: number;
  speedBytesPerSec: number;
  etaSeconds: number;
  retryCount: number;
  checksumVerified?: boolean;
  error?: string;
};

type EventItem = {
  transferId: string;
  type: string;
  message: string;
  timestamp: string;
};

const formatBytes = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatSpeed = (value: number): string => `${formatBytes(Math.round(value))}/s`;

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [chunkSizeKb, setChunkSizeKb] = useState<number>(512);
  const [autoChunkSize, setAutoChunkSize] = useState<boolean>(true);
  const [transferId, setTransferId] = useState<string>("");
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; fileName: string; status: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [hint, setHint] = useState<PredictorHint | null>(null);
  const [lastUsedChunkSize, setLastUsedChunkSize] = useState<number | null>(null);

  const progress = useMemo(() => {
    if (!status || status.totalChunks <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((status.receivedChunks / status.totalChunks) * 100));
  }, [status]);

  const refreshHistory = async (): Promise<void> => {
    const result = await listTransfers();
    setHistory(
      result.items.map((x: TransferSession) => ({
        id: x.id,
        fileName: x.fileName,
        status: x.status
      }))
    );
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const next = await getPredictorHint();
        if (!cancelled) {
          setHint(next);
        }
      } catch {
        // predictor may not be up; ignore
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket(apiBase.replace("http", "ws") + "/ws");

    ws.onmessage = (evt) => {
      const payload = JSON.parse(evt.data) as {
        type: string;
        transferId: string;
        data: RuntimeStatus | EventItem;
      };

      if (payload.type === "status") {
        setStatus(payload.data as RuntimeStatus);
      }

      if (payload.type === "event") {
        setEvents((prev) => [...prev.slice(-99), payload.data as EventItem]);
      }
    };

    return () => ws.close();
  }, []);

  const startTransfer = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError("");

    if (!file) {
      setError("Pick a file before starting transfer.");
      return;
    }

    setBusy(true);
    try {
      const session = await createTransfer({
        fileName: file.name,
        fileSize: file.size,
        ...(autoChunkSize ? {} : { chunkSize: chunkSizeKb * 1024 })
      });

      setTransferId(session.transferId);
      setLastUsedChunkSize(session.session?.chunkSize ?? null);
      await uploadFile(session.transferId, file);
      const eventResult = await getEvents(session.transferId);
      setEvents(eventResult.items as EventItem[]);
      await refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  const onResume = async (): Promise<void> => {
    if (!transferId) {
      return;
    }

    setBusy(true);
    try {
      await resumeTransfer(transferId);
      await refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resume failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 text-ocean">
      <section className="float-in mb-6 rounded-3xl p-6 shadow-xl glass">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Real-Time Fault-Tolerant File Streaming System using Big Data Technologies
        </h1>
        <p className="mt-2 text-slate-700">
          StreamBridge dashboard: Kafka chunk streaming, resume/retry, checksum verification, and live
          transfer telemetry.
        </p>
      </section>

      <PredictorBanner hint={hint} />


      <div className="grid gap-6 lg:grid-cols-3">
        <section className="float-in rounded-3xl p-6 shadow-lg glass lg:col-span-1">
          <h2 className="font-display text-xl font-semibold">Upload</h2>
          <form className="mt-4 space-y-4" onSubmit={(e) => void startTransfer(e)}>
            <label className="block text-sm text-slate-700">File</label>
            <input
              type="file"
              className="w-full rounded-xl border border-slate-200 bg-white p-2"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={autoChunkSize}
                onChange={(e) => setAutoChunkSize(e.target.checked)}
              />
              Auto chunk size (use predictor)
            </label>

            <label className="block text-sm text-slate-700">Chunk size (KB)</label>
            <input
              type="number"
              min={64}
              step={64}
              value={chunkSizeKb}
              disabled={autoChunkSize}
              onChange={(e) => setChunkSizeKb(Number(e.target.value) || 512)}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 disabled:bg-slate-100 disabled:text-slate-500"
            />

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-ember px-4 py-2 font-medium text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? "Working..." : "Start transfer"}
            </button>
          </form>

          {transferId && (
            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3 font-mono text-xs">
              transferId: {transferId}
              {lastUsedChunkSize !== null && (
                <div className="mt-1 text-slate-700">
                  actual chunk size used: {formatBytes(lastUsedChunkSize)}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </section>

        <section className="float-in rounded-3xl p-6 shadow-lg glass lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Live transfer</h2>
            <button
              type="button"
              onClick={() => void onResume()}
              className="rounded-xl bg-pine px-3 py-2 text-sm font-medium text-white"
            >
              Resume transfer
            </button>
          </div>

          <div className="mb-4 h-4 overflow-hidden rounded-full bg-cyan-100">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Status" value={status?.status ?? "idle"} />
            <Metric label="Progress" value={`${progress}%`} />
            <Metric
              label="Chunks"
              value={`${status?.receivedChunks ?? 0}/${status?.totalChunks ?? 0}`}
            />
            <Metric label="Speed" value={formatSpeed(status?.speedBytesPerSec ?? 0)} />
            <Metric label="ETA" value={`${status?.etaSeconds ?? 0}s`} />
            <Metric label="Bytes" value={formatBytes(status?.bytesTransferred ?? 0)} />
            <Metric label="Retries" value={`${status?.retryCount ?? 0}`} />
            <Metric
              label="Checksum"
              value={
                status?.checksumVerified === undefined
                  ? "pending"
                  : status.checksumVerified
                    ? "valid"
                    : "mismatch"
              }
            />
          </div>

          <h3 className="mt-6 font-display text-lg font-semibold">Event feed</h3>
          <div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white/70 p-3 font-mono text-xs">
            {events.length === 0 && <p className="text-slate-500">No events yet.</p>}
            {events.map((item, idx) => (
              <div key={`${item.timestamp}-${idx}`} className="py-1 text-slate-700">
                [{new Date(item.timestamp).toLocaleTimeString()}] {item.type} - {item.message}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="float-in mt-6 rounded-3xl p-6 shadow-lg glass">
        <h2 className="font-display text-xl font-semibold">History</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {history.map((h) => (
            <article key={h.id} className="rounded-2xl border border-slate-200 bg-white/75 p-3">
              <p className="font-medium">{h.fileName}</p>
              <p className="font-mono text-xs text-slate-600">{h.id}</p>
              <p className="mt-1 text-sm">status: {h.status}</p>
              <a
                href={`${apiBase}/api/transfers/${h.id}/download`}
                className="mt-2 inline-block rounded-lg bg-ocean px-3 py-2 text-xs font-medium text-white"
              >
                Download reconstructed file
              </a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white/80 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </article>
  );
}

const regimeStyles: Record<PredictorHint["regime"], { badge: string; label: string }> = {
  low: { badge: "bg-red-100 text-red-700 border-red-200", label: "LOW stability" },
  medium: { badge: "bg-amber-100 text-amber-700 border-amber-200", label: "MEDIUM stability" },
  high: { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "HIGH stability" }
};

function PredictorBanner({ hint }: { hint: PredictorHint | null }) {
  if (!hint) {
    return (
      <section className="float-in mb-6 rounded-3xl p-4 shadow-lg glass">
        <p className="text-sm text-slate-600">
          Predictor: waiting for metric samples... (upload a file to generate telemetry)
        </p>
      </section>
    );
  }

  const style = regimeStyles[hint.regime];
  const recommended = hint.recommendedChunkSize;
  const fmt = (value: number): string =>
    value >= 1024 * 1024
      ? `${(value / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(value / 1024)} KB`;

  const features = hint.featureSnapshot;

  return (
    <section className="float-in mb-6 rounded-3xl p-4 shadow-lg glass">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${style.badge}`}
        >
          {style.label}
        </span>
        <span className="text-sm text-slate-700">
          Predictor ({hint.source.toUpperCase()}) recommends{" "}
          <strong className="font-semibold">{fmt(recommended)}</strong> per chunk
        </span>
        <span className="text-xs text-slate-500">
          score {hint.stabilityScore.toFixed(2)} · updated{" "}
          {new Date(hint.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3 lg:grid-cols-5">
        <span>
          throughput EWMA: <strong>{fmt(features.throughputEwmaBytesPerSec)}/s</strong>
        </span>
        <span>
          CV: <strong>{features.throughputCv.toFixed(2)}</strong>
        </span>
        <span>
          retries/min: <strong>{features.retryRatePerMin.toFixed(2)}</strong>
        </span>
        <span>
          errors/min: <strong>{features.errorRatePerMin.toFixed(2)}</strong>
        </span>
        <span>
          lag slope: <strong>{features.consumerLagSlope.toFixed(2)}</strong>
        </span>
      </div>
    </section>
  );
}
