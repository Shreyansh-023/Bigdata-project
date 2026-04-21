$ErrorActionPreference = "Stop"

Write-Host "[1/4] Checking local prerequisites"
java -version
node -v
npm -v
docker --version

Write-Host "[2/4] Installing dependencies"
npm install

Write-Host "[3/4] Starting Kafka + services with Docker Compose"
Set-Location "infra/docker"
docker compose up -d kafka kafka-init
Set-Location ../..

Write-Host "[4/4] Start local services in separate terminals"
Write-Host "API:       npm run --workspace @streambridge/api dev"
Write-Host "Worker:    npm run --workspace @streambridge/worker dev"
Write-Host "Analytics: npm run --workspace @streambridge/analytics dev"
Write-Host "Web:       npm run --workspace @streambridge/web dev"
