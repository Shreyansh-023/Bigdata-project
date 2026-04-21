"""LSTM architecture for network stability classification.

Status: UNTRAINED. This file defines the model only; no weights have been
fit yet. See ../README.md for the planned training pipeline and current
state.

The intended input is a time-series of feature vectors, each vector
describing one metric window. The output is a 3-way classification over
{low, medium, high} stability regimes, which the runtime controller maps
to chunk sizes {64 KB, 512 KB, 2 MB}.
"""

from __future__ import annotations

import torch
from torch import nn


FEATURE_NAMES = (
    "throughput_ewma_bytes_per_sec",
    "throughput_cv",
    "retry_rate_per_min",
    "error_rate_per_min",
    "consumer_lag_slope",
    "window_seconds",
)

NUM_FEATURES = len(FEATURE_NAMES)
NUM_CLASSES = 3
SEQUENCE_LENGTH = 12
HIDDEN_SIZE = 32
NUM_LAYERS = 2
DROPOUT = 0.2


class StabilityLSTM(nn.Module):
    """Two-layer LSTM + classifier head.

    Not yet trained. Instantiating this model yields randomly initialized
    weights; calling forward() will produce meaningless predictions until
    train.py has been run against a real dataset.
    """

    def __init__(
        self,
        num_features: int = NUM_FEATURES,
        hidden_size: int = HIDDEN_SIZE,
        num_layers: int = NUM_LAYERS,
        num_classes: int = NUM_CLASSES,
        dropout: float = DROPOUT,
    ) -> None:
        super().__init__()
        self.num_features = num_features
        self.hidden_size = hidden_size
        self.num_layers = num_layers

        self.norm = nn.LayerNorm(num_features)
        self.lstm = nn.LSTM(
            input_size=num_features,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0.0,
            batch_first=True,
        )
        self.classifier = nn.Sequential(
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: (batch, sequence_length, num_features)
        x = self.norm(x)
        lstm_out, _ = self.lstm(x)
        last_step = lstm_out[:, -1, :]
        return self.classifier(last_step)


def describe(model: StabilityLSTM) -> str:
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return (
        f"StabilityLSTM\n"
        f"  features   : {model.num_features} ({', '.join(FEATURE_NAMES)})\n"
        f"  hidden     : {model.hidden_size}\n"
        f"  layers     : {model.num_layers}\n"
        f"  seq length : {SEQUENCE_LENGTH}\n"
        f"  classes    : {NUM_CLASSES} (low / medium / high)\n"
        f"  params     : {total_params} ({trainable_params} trainable)\n"
        f"  status     : UNTRAINED — awaiting collected telemetry"
    )


if __name__ == "__main__":
    print(describe(StabilityLSTM()))
