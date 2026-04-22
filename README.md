# StreamBridge — Real-Time Fault-Tolerant File Streaming over Kafka

StreamBridge is a production-like prototype that streams files in **chunks** through **Apache Kafka**, enabling **resume/retry**, **checksum validation (SHA-256)**, and **fault-tolerant reassembly**, with a **live dashboard** for real-time visibility.

## What you get

- **Chunked upload + streaming via Kafka**
- **Resumable transfers** (retry from last confirmed chunk)
- **Integrity checks** using **SHA-256**
- **Fault-tolerant consumer reassembly**
- **Real-time events** to the UI via **WebSockets**
- **Analytics/metrics consumer** (event stream processing)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Monorepo Layout](#monorepo-layout)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker)](#quick-start-docker)
- [Quick Start (Local Dev)](#quick-start-local-dev)
- [How It Works (High Level)](#how-it-works-high-level)
- [Core APIs](#core-apis)
- [WebSocket Events](#websocket-events)
- [Verification & Troubleshooting](#verification--troubleshooting)
- [Demo Flow](#demo-flow)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

---

## Architecture Overview

**Goal:** reliably transfer a file from a client to storage by splitting it into chunks and streaming those chunks via Kafka.

**Data flow (simplified):**
1. User selects a file in **Web UI**
2. UI calls **API** to start a transfer session
3. UI uploads file chunks to **API**
4. API publishes chunks to **Kafka** (`file-chunks` topic, for example)
5. **Worker** consumes chunks, reassembles them in order, validates checksum, writes final output
6. **Analytics** consumes events for metrics/monitoring
7. UI receives real-time status via **WebSocket** (progress, retries, completion)

> See `docs/` for diagrams and deeper notes (if present).

---

## Monorepo Layout

```text
apps/
  web/        React + Vite dashboard (upload + live events)
  api/        Node.js + Express transfer API + WebSocket gateway
  worker/     Kafka consumer + file reassembler + checksum verifier
  analytics/  Metrics/event consumer API
packages/
  shared/     Shared TypeScript types/contracts
infra/
  docker/     Docker Compose for Kafka + services
  scripts/    Startup and verification scripts
docs/
  api/
  kafka/
  diagrams/
  demo/
```

---

## Prerequisites

Pick **one** option:

### Option A — Docker (recommended)
- Docker + Docker Compose

### Option B — Local development
- Node.js (LTS recommended)
- npm / pnpm (whatever the repo uses)
- Kafka + Zookeeper (or KRaft) locally, or via Docker

---

## Quick Start (Docker)

1. **Clone**
   ```bash
   git clone https://github.com/Shreyansh-023/Bigdata-project.git
   cd Bigdata-project
   ```

2. **Start infrastructure + apps**
   > Adjust the command below to match your repo scripts (examples shown).
   ```bash
   docker compose -f infra/docker/docker-compose.yml up --build
   ```

3. **Open**
- Web dashboard: `http://localhost:5173` (or whatever your Vite port is)
- API health: `http://localhost:3000/health` (example)

---

## Quick Start (Local Dev)

> Update commands below to match your package manager and scripts.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start Kafka (Docker recommended):
   ```bash
   docker compose -f infra/docker/docker-compose.yml up kafka zookeeper
   ```

3. Start services (in separate terminals):
   ```bash
   npm run dev:web
   npm run dev:api
   npm run dev:worker
   npm run dev:analytics
   ```

---

## How It Works (High Level)

### Transfer lifecycle
1. **Initialize transfer**
   - Client requests a `transferId`
   - API stores metadata (filename, total size, chunk size, expected checksum, etc.)

2. **Upload chunks**
   - Client sends chunks with chunk index + bytes
   - API publishes to Kafka with ordering metadata

3. **Reassembly**
   - Worker consumes messages
   - Writes chunks to a staging area
   - On completion, verifies SHA-256 and finalizes

4. **Recovery**
   - If the client disconnects or fails mid-way, it can query the server for the last confirmed chunk and resume.

---

## Core APIs

> Paths below are **example-friendly**. Update to match your actual endpoints.

### Health
```http
GET /health
```

### Create transfer session
```http
POST /transfers
Content-Type: application/json

{
  "fileName": "video.mp4",
  "fileSize": 12345678,
  "chunkSize": 1048576,
  "sha256": "<expected sha256>"
}
```

Response:
```json
{
  "transferId": "abc123",
  "uploadUrl": "/transfers/abc123/chunks"
}
```

### Upload a chunk
```http
POST /transfers/:transferId/chunks
Content-Type: application/octet-stream

Headers:
  X-Chunk-Index: 0
  X-Chunk-Size: 1048576
  X-Chunk-Sha256: "<optional>"
```

### Resume status
```http
GET /transfers/:transferId/status
```

Response:
```json
{
  "transferId": "abc123",
  "receivedChunks": 10,
  "nextChunkIndex": 10,
  "state": "IN_PROGRESS"
}
```

---

## WebSocket Events

> Example event types—update to match your implementation.

- `transfer.created`
- `chunk.received`
- `transfer.progress`
- `transfer.completed`
- `transfer.failed`
- `transfer.retried`

Example payload:
```json
{
  "type": "transfer.progress",
  "transferId": "abc123",
  "receivedChunks": 18,
  "totalChunks": 42,
  "percent": 42.85
}
```

---

## Verification & Troubleshooting

### Check containers/services
```bash
docker ps
docker compose -f infra/docker/docker-compose.yml logs -f
```

### Verify Kafka topics (examples)
```bash
docker exec -it kafka bash
kafka-topics --bootstrap-server localhost:9092 --list
```

### Common issues
- **Kafka not reachable**: confirm `KAFKA_BROKER` / `bootstrap.servers` matches Docker networking
- **Large files failing**: increase API body limits and reverse-proxy limits
- **Out-of-order chunks**: ensure message keys/partitioning strategy preserves ordering per `transferId`

---

## Demo Flow

1. Start all services (Docker or local)
2. Open Web dashboard
3. Upload a file
4. Observe:
   - chunk progress
   - retries/resume behavior (try refreshing mid-upload)
   - checksum verification result
5. Confirm final file exists in worker output directory (as configured)

---

## Configuration

Document your key environment variables here (examples):

| Variable | Used by | Description | Example |
|---|---|---|---|
| `KAFKA_BROKER` | api/worker/analytics | Kafka bootstrap server | `kafka:9092` |
| `CHUNK_SIZE_BYTES` | api/web | Default chunk size | `1048576` |
| `OUTPUT_DIR` | worker | Where final files are written | `./output` |
| `WS_PORT` | api | WebSocket port | `3001` |

> Add `.env.example` to the repo if you don’t already have one.

---

## Contributing

- Create a feature branch: `git checkout -b feature/my-change`
- Run tests/lint (if configured): `npm test`, `npm run lint`
- Open a PR with:
  - what changed
  - how to test
  - screenshots (for UI changes)

---

## License

Specify a license (MIT/Apache-2.0/etc). If you don’t have one yet, add a `LICENSE` file.
