# Predictor ML (Future Work)

This directory contains a **planned future enhancement** to StreamBridge's
predictive chunk-size controller. **None of this is wired into the live system
yet** — the runtime controller in `../src/` is the classical EWMA policy, which
is fully sufficient for the current deployment.

The files here define the LSTM architecture and the training pipeline we
intend to run once we have collected enough labelled telemetry from real
transfers.

## Status

| Artifact                          | State                          |
| --------------------------------- | ------------------------------ |
| `model.py` (LSTM architecture)    | Defined, **weights untrained** |
| `train.py` (training loop)        | Runnable, **needs real data**  |
| `../data/sample_training_windows.json` | Schema sample, **5 synthetic rows only** |
| Trained checkpoint (`*.pt`)       | Not produced yet               |
| Exported ONNX (`*.onnx`)          | Not produced yet               |
| Integration into runtime service  | Not done — EWMA is live        |

## Planned Pipeline

1. Run the predictor service in production for 2–4 weeks to accumulate metric
   windows in Kafka.
2. Dump `file-transfer-metrics` to a labelled dataset using the script in
   `label_windows.py` (to be written).
3. Run `train.py` on the collected data; it reads JSON in the schema shown in
   `../data/sample_training_windows.json` and saves a PyTorch checkpoint.
4. Export to ONNX for in-process inference inside the Node predictor service
   via `onnxruntime-node`.
5. Introduce a feature flag `PREDICTOR_MODE={ewma,ml}` so we can shadow-test
   the ML model against the EWMA baseline before promoting it.

## Why LSTM

Throughput, retry rate, and consumer lag exhibit temporal patterns that a
sliding-window statistic loses (e.g. slow build-up of congestion before a
failure). An LSTM over the last N metric samples can pick up those patterns.
That said, we expect a logistic regression to be competitive on our small
dataset; `train.py` includes a `--baseline` flag that trains a simple LR model
for comparison.

## Running the training script (once data exists)

```bash
cd apps/predictor/ml
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Replace data/sample_training_windows.json with your collected dataset first.
python train.py --data ../data/training_windows.json --epochs 20 --out checkpoints/lstm.pt
```

Until the dataset is real, the training script runs in **smoke-test mode**:
it loads the 5-row sample file, verifies the schema, prints the model
summary, and exits without producing a trainable checkpoint.
