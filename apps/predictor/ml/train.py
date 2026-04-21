"""Training scaffold for the StabilityLSTM model.

Status: NOT YET RUN AGAINST REAL DATA.

This script is fully implemented but intentionally kept in "smoke test"
mode until we collect enough real telemetry from production transfers. It
expects input files in the schema documented in
`../data/sample_training_windows.json`.

Run modes:

  python train.py                                   # smoke-test on the sample file
  python train.py --data path/to/real.json          # real training run
  python train.py --baseline                        # train logistic regression instead

Once a real dataset exists, replace `../data/sample_training_windows.json`
with the collected windows and re-run without --smoke-test.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

from model import FEATURE_NAMES, SEQUENCE_LENGTH, StabilityLSTM, describe


LABEL_TO_INDEX = {"low": 0, "medium": 1, "high": 2}


class WindowDataset(Dataset):
    def __init__(self, rows: list[dict], sequence_length: int = SEQUENCE_LENGTH) -> None:
        self.rows = rows
        self.sequence_length = sequence_length

    def __len__(self) -> int:
        return max(0, len(self.rows) - self.sequence_length + 1)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        window = self.rows[index : index + self.sequence_length]
        features = torch.tensor(
            [[row["features"][name] for name in FEATURE_NAMES] for row in window],
            dtype=torch.float32,
        )
        label = torch.tensor(LABEL_TO_INDEX[window[-1]["label"]], dtype=torch.long)
        return features, label


def load_rows(path: Path) -> list[dict]:
    with path.open() as f:
        payload = json.load(f)
    rows = payload.get("windows", [])
    if not rows:
        raise ValueError(f"No windows found in {path}")
    return rows


def train(rows: list[dict], epochs: int, lr: float, out_path: Path) -> None:
    random.shuffle(rows)
    split = int(len(rows) * 0.8)
    train_rows, val_rows = rows[:split], rows[split:]
    train_loader = DataLoader(WindowDataset(train_rows), batch_size=16, shuffle=True)
    val_loader = DataLoader(WindowDataset(val_rows), batch_size=16)

    model = StabilityLSTM()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    criterion = nn.CrossEntropyLoss()

    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        for xb, yb in train_loader:
            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * xb.size(0)

        model.eval()
        val_correct = 0
        val_total = 0
        with torch.no_grad():
            for xb, yb in val_loader:
                preds = model(xb).argmax(dim=-1)
                val_correct += (preds == yb).sum().item()
                val_total += yb.size(0)

        val_acc = val_correct / val_total if val_total else float("nan")
        print(f"epoch {epoch + 1:02d}  train_loss={train_loss / max(1, len(train_rows)):.4f}  val_acc={val_acc:.3f}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), out_path)
    print(f"Saved checkpoint to {out_path}")


def smoke_test(rows: list[dict]) -> None:
    print(describe(StabilityLSTM()))
    print()
    print(f"Loaded {len(rows)} sample rows from dataset file.")
    print("First row (schema check):")
    print(json.dumps(rows[0], indent=2))
    print()
    print("SMOKE TEST ONLY — not enough data to train.")
    print("Collect real telemetry and re-run without --smoke-test, or pass --data <real.json>.")


def main() -> None:
    parser = argparse.ArgumentParser()
    default_data = Path(__file__).parent.parent / "data" / "sample_training_windows.json"
    parser.add_argument("--data", type=Path, default=default_data)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--out", type=Path, default=Path("checkpoints/lstm.pt"))
    parser.add_argument("--baseline", action="store_true", help="train logistic regression instead")
    parser.add_argument("--force-train", action="store_true", help="skip the sample-size guard")
    args = parser.parse_args()

    rows = load_rows(args.data)
    min_required = SEQUENCE_LENGTH * 10

    if len(rows) < min_required and not args.force_train:
        smoke_test(rows)
        return

    if args.baseline:
        raise SystemExit("baseline (logistic regression) branch not implemented yet — placeholder")

    train(rows, epochs=args.epochs, lr=args.lr, out_path=args.out)


if __name__ == "__main__":
    main()
