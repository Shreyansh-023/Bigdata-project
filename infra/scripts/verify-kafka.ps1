$ErrorActionPreference = "Stop"

Write-Host "Creating topics (idempotent)..."
docker exec streambridge-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic file-transfer-metadata --partitions 3 --replication-factor 1
docker exec streambridge-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic file-transfer-chunks --partitions 6 --replication-factor 1
docker exec streambridge-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic file-transfer-events --partitions 3 --replication-factor 1
docker exec streambridge-kafka kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic file-transfer-metrics --partitions 3 --replication-factor 1

Write-Host "Listing topics..."
docker exec streambridge-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list

Write-Host "Publishing/consuming smoke message..."
docker exec streambridge-kafka bash -lc "echo '{\"ping\":\"pong\"}' | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic file-transfer-events"
docker exec streambridge-kafka bash -lc "kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic file-transfer-events --from-beginning --max-messages 1"
