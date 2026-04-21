# StreamBridge API Documentation

Base URL: `http://localhost:4000`

## Health
- `GET /health`

## Transfers
- `GET /api/transfers`
- `POST /api/transfers`
  - body: `{ fileName, fileSize, chunkSize, senderId?, receiverId? }`
- `POST /api/transfers/:id/file`
  - multipart form field: `file`
- `GET /api/transfers/:id/status`
- `GET /api/transfers/:id/metrics`
- `POST /api/transfers/:id/resume`
  - body: `{ missingChunks?: number[] }`
- `GET /api/transfers/:id/events`
- `GET /api/transfers/:id/download`

## WebSocket
- `ws://localhost:4000/ws`
- message types:
  - `status`
  - `event`
  - `metric`
