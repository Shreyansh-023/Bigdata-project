# Kafka Topics

## file-transfer-metadata
Stores transfer session metadata records.

## file-transfer-chunks
Carries chunk payload events. Each message includes transfer ID, chunk index, and SHA-256 checksums.

## file-transfer-events
Stores lifecycle events: started, chunk_published, chunk_consumed, retry, resend, completed, failed, resumed.

## file-transfer-metrics
Stores throughput, latency, retries, consumer lag, and error counters.
