# Real-Time Fault-Tolerant File Streaming System using Big Data Technologies

## 1) Product name
**Official topic name:** Real-Time Fault-Tolerant File Streaming System using Big Data Technologies  
**Suggested internal code name:** StreamBridge

Do not rename the official topic in the final presentation. The team should present it exactly as above.

## 2) One-line product summary
Build a web-based system that transfers large files as chunked streams through **Apache Kafka**, with real-time progress tracking, fault tolerance, resume support, and a frontend dashboard that proves the transfer is working end-to-end.

## 3) Problem statement
Traditional cloud upload/download flows are slow because:
- the sender uploads the full file first,
- the receiver downloads later,
- the file usually waits in intermediate storage,
- retry/resume behavior is not always transparent to users.

We want a system where:
- a file is split into chunks,
- chunks are streamed in real time,
- Kafka acts as the distributed buffer and delivery backbone,
- the receiver reconstructs the file continuously,
- progress, failures, and throughput are visible live.

## 4) Project goal
Create a production-like prototype that demonstrates:
1. real-time file chunk streaming,
2. fault-tolerant delivery,
3. resume after interruption,
4. big-data-style event streaming with Kafka,
5. a polished frontend for upload, transfer monitoring, and verification.

## 5) Non-goals
This project is **not** trying to replace Google Drive or GitHub storage.
It is also **not** trying to build a public cloud file hosting service.

Do not add unnecessary features such as:
- public file gallery,
- social sharing feed,
- permanent file storage service,
- user recommendations,
- AI image generation,
- unrelated chat features.

## 6) Core idea
Use Kafka as the streaming fabric for file chunks and transfer events.

### High-level flow
1. User selects a file in the frontend.
2. Frontend sends the file to the backend transfer API.
3. Backend splits the file into chunks.
4. Producer publishes chunk messages to Kafka.
5. Consumer service reads the chunks from Kafka.
6. Receiver service reassembles the file in order.
7. Integrity is verified using hash/checksum.
8. Frontend shows live progress, speed, retries, and completion status.

## 7) Architecture
### Frontend
- Upload page
- Live transfer dashboard
- File list / active session list
- Progress bar
- Chunk count, bytes transferred, speed, ETA
- Error/retry status
- Final checksum result

### Backend API
Responsibilities:
- create transfer sessions,
- assign a transfer ID,
- split file into chunks,
- publish metadata and chunk events,
- coordinate sender and receiver sessions,
- expose status APIs,
- serve transfer logs and metrics.

### Kafka layer
Responsibilities:
- carry chunk payloads as events,
- buffer temporary interruptions,
- enable consumer resume through offsets,
- support retries,
- provide observability through metrics.

### Receiver service
Responsibilities:
- consume chunk messages,
- order them correctly,
- write them into a temporary reconstruction buffer,
- assemble final file,
- verify checksum,
- report completion.

### Analytics / monitoring service
Responsibilities:
- consume transfer telemetry,
- compute throughput,
- detect retries/failures,
- show latency trends,
- optionally generate charts for the dashboard.

## 8) Recommended technology stack
Use the stack below unless the team has a strong reason to change it.

### Frontend
- React 19.2
- Vite latest stable
- TypeScript latest stable
- Tailwind CSS latest stable
- Optional UI helpers: shadcn/ui, lucide-react

### Backend API
- Node.js 22 LTS
- Express or Fastify
- WebSocket support for live progress updates
- REST endpoints for transfer control

### Kafka / streaming
- Apache Kafka 4.1.x
- Java 21 LTS for Kafka runtime and Java-based services
- If using Docker, prefer the official Kafka 4.1.x image available from Apache

### Optional native performance layer
- C++17 or C++20
- librdkafka for native Kafka client access
- Use this only if the team wants a native chunking worker or performance tests

### Data / schemas
- JSON for MVP metadata
- Avro or Protobuf for phase 2 if the team wants stricter schemas
- SHA-256 for checksum validation

### Deployment / dev environment
- Docker Desktop
- Docker Compose
- Git
- VS Code or another IDE

## 9) Version policy
Use versions that are compatible with current official docs:

- Kafka quickstart currently requires **Java 17+** and documents Kafka 4.1.x startup in KRaft mode.
- Kafka documentation says **Java 17 and Java 21 are fully supported**, and the docs recommend the latest LTS release.
- React docs list **React 19.2** as the latest version.
- Node.js production apps should use an **Active LTS or Maintenance LTS** line; Node 22 is currently an LTS line.

Recommended build baseline for this project:
- Java 21 LTS
- Apache Kafka 4.1.x
- Node.js 22 LTS
- React 19.2
- TypeScript latest stable
- Docker latest stable

If a machine cannot support Java 21, fall back to Java 17, but document the reason.

## 10) Kafka topic design
Create these topics:

### `file-transfer-metadata`
Stores:
- transferId
- fileName
- fileSize
- chunkSize
- totalChunks
- senderId
- receiverId
- checksum algorithm
- timestamp

### `file-transfer-chunks`
Stores:
- transferId
- chunkIndex
- payload bytes
- payload size
- checksum per chunk
- sequencing metadata

### `file-transfer-events`
Stores:
- started
- chunk published
- chunk consumed
- retry
- resend
- completed
- failed
- resumed

### `file-transfer-metrics`
Stores:
- throughput
- latency
- retry count
- consumer lag
- error count

## 11) Chunking rules
- Never send the entire file as one Kafka message.
- Default chunk size for MVP: **512 KB**
- Each chunk must include:
  - transferId,
  - chunkIndex,
  - totalChunks,
  - file hash reference,
  - payload.
- Order must be preserved during reconstruction.
- Chunk size should be configurable in the UI and backend config.

## 12) Fault tolerance design
### Producer-side
- Enable idempotent producer behavior.
- Use acknowledgements from all in-sync replicas where possible.
- Retry transient failures automatically.
- Keep an in-memory manifest of sent chunks.

### Consumer-side
- Commit offsets only after a chunk is safely processed.
- On restart, resume from the last committed offset.
- Detect missing chunks and request resend if needed.
- Validate chunk checksum before accepting data.

### File integrity
- Compute a SHA-256 checksum for the original file.
- Compute checksum again after reconstruction.
- Mark transfer failed if hash does not match.

### Recovery scenarios
The system must handle:
- backend restart,
- consumer restart,
- temporary network interruption,
- partial chunk loss,
- application refresh on the frontend.

## 13) Frontend requirements
### Pages
1. **Home / upload page**
   - file picker
   - chunk size selector
   - start transfer button

2. **Live transfer page**
   - transfer ID
   - progress bar
   - transfer speed
   - ETA
   - chunks sent / total chunks
   - live event feed

3. **History page**
   - completed transfers
   - failed transfers
   - checksum result
   - download reconstructed file

### UX rules
- Use a clean, modern, minimal UI.
- Show status states clearly:
  - idle,
  - running,
  - paused,
  - retrying,
  - completed,
  - failed.
- The user must always know whether the file is still being sent, already reconstructed, or waiting for recovery.

## 14) Backend requirements
### APIs
Implement REST endpoints like:
- `POST /api/transfers` to create a transfer session
- `POST /api/transfers/:id/file` to submit the file
- `GET /api/transfers/:id/status` for live state
- `GET /api/transfers/:id/metrics` for telemetry
- `POST /api/transfers/:id/resume` for recovery
- `GET /api/transfers/:id/download` for reconstructed output

### WebSocket events
Push live updates for:
- progress,
- chunk acknowledgements,
- retry events,
- latency updates,
- completion/failure.

### Error handling
- Validate file type and size.
- Reject empty uploads.
- Reject invalid chunk metadata.
- Return clear JSON error messages.
- Log every failure with transferId.

## 15) Big data usage requirements
This project must use Kafka in a way that is clearly visible and defensible in the demo.

Minimum big-data signals:
- real-time event streaming,
- distributed buffering,
- offset-based recovery,
- telemetry topics,
- throughput monitoring,
- consumer lag inspection.

Optional advanced big-data layer:
- Kafka Streams for live transformation,
- Spark Structured Streaming for analytics,
- dashboards for throughput and lag,
- replica-aware transfer strategy.

## 16) Data model
### TransferSession
- id
- fileName
- fileSize
- chunkSize
- totalChunks
- status
- senderId
- receiverId
- checksum
- createdAt
- updatedAt

### ChunkEvent
- transferId
- chunkIndex
- totalChunks
- payload
- payloadChecksum
- createdAt

### TransferMetric
- transferId
- throughput
- latency
- consumerLag
- retryCount
- timestamp

## 17) Verification strategy
The coding agent must verify each layer.

### Local environment verification
- `java -version`
- `node -v`
- `npm -v`
- `docker --version`
- Kafka broker starts without errors
- frontend starts without build errors
- backend starts without runtime errors

### Kafka verification
- create topic successfully,
- publish a test message,
- consume the same message,
- verify KRaft mode is running,
- confirm broker is reachable.

### End-to-end transfer verification
Test these files:
- a small text file,
- a 50 MB file,
- a 1 GB file if machine resources allow.

For each test, verify:
- file is reconstructed correctly,
- checksum matches,
- progress reaches 100%,
- transfer can resume after restart,
- no chunk is duplicated or lost.

### UI verification
- upload button works,
- progress updates live,
- status changes are visible,
- completion state is shown,
- error state is human-readable.

## 18) Acceptance criteria
The project is complete only if all of these are true:
- a file can be streamed in chunks through Kafka,
- the receiver reconstructs the exact file,
- checksum verification passes,
- the transfer survives a restart and resumes,
- the dashboard shows progress and metrics,
- the system demonstrates real-time big-data streaming behavior,
- the team can explain the Kafka role clearly in the demo.

## 19) Milestone plan
### Milestone 1: Skeleton
- repo setup
- frontend bootstrapped
- backend bootstrapped
- Kafka running locally

### Milestone 2: Transfer pipeline
- chunk splitting
- Kafka producer
- Kafka consumer
- file reconstruction

### Milestone 3: Reliability
- offset resume
- retries
- checksum validation
- failure simulation

### Milestone 4: UI polish
- transfer dashboard
- live metrics
- history view
- error handling

### Milestone 5: Demo hardening
- sample files
- docs
- screenshots
- final presentation script

## 20) Repository structure
Suggested monorepo layout:

```text
streambridge/
  apps/
    web/
    api/
    worker/
    analytics/
  packages/
    shared/
    schemas/
    utils/
  infra/
    docker/
    kafka/
    scripts/
  docs/
    prd/
    diagrams/
    demo/
```

## 21) Implementation notes for the coding agent
- Build the smallest working end-to-end path first.
- Do not spend too long polishing UI before the transfer pipeline works.
- Keep all transfer IDs and chunk indexes deterministic.
- Use a manifest file or metadata record for reconstruction order.
- Prefer clean logs over fancy abstractions.
- If a feature increases complexity without improving the demo, postpone it.
- Add comments in code where Kafka semantics matter.
- Use environment variables for all ports, URLs, credentials, and topic names.

## 22) Human-required steps
Some tasks require a human because a coding agent cannot complete them alone:
- installing system software,
- accepting OS dialogs,
- enabling Docker Desktop,
- granting firewall permissions,
- restarting the machine,
- signing into IDE/plugin accounts if needed,
- copying files into the project from the user’s machine,
- confirming that local antivirus or firewall is not blocking ports.

Create a separate `user_info.txt` with these instructions so the human can complete the missing setup steps.

## 23) What the coding agent should build first
Order of execution:
1. Kafka local environment
2. backend API health check
3. file chunking
4. Kafka producer
5. Kafka consumer and reassembler
6. checksum validation
7. frontend upload and live progress
8. restart/resume demo
9. metrics dashboard
10. documentation and demo script

## 24) Final demo story
The demo should prove:
- file starts streaming immediately,
- transfer state is visible,
- interruption does not destroy progress,
- consumer can resume,
- reconstruction is exact,
- Kafka is the core streaming backbone.

## 25) Deliverables
The coding agent should produce:
- source code,
- runnable setup scripts,
- Docker Compose or local startup scripts,
- README,
- API docs,
- Kafka topic documentation,
- architecture diagram,
- demo checklist,
- `user_info.txt` for human-only setup steps.
