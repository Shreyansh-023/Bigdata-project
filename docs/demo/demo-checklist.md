# Demo Checklist

1. Start Kafka and create topics.
2. Start API, worker, analytics, and web apps.
3. Upload a small text file and verify 100% completion.
4. Upload a 50 MB file and observe live throughput and ETA.
5. Simulate interruption (stop worker), then restart and call resume endpoint.
6. Verify checksum status is `valid`.
7. Download reconstructed file and compare with original hash.
8. Show Kafka topics and explain producer/consumer flow.
