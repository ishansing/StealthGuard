"""Train the lightweight sequence-model shadow candidate (Phase 9 A3).

Encodes each session's raw event stream into a fixed-length per-event sequence
and trains a small MLP over the flattened stream. Outputs
`model-v2-seq.pkl` + `metadata-v2-seq.json` in MODEL_DIR. This candidate is
evaluated in shadow only (compare_shadow.py); it never affects decisions
(ADR-0009).

Usage (in the ml-service container):
    python -m training.train_seq --data /data/sessions.csv --output-dir /app/models
"""

import argparse
import json
import os
from datetime import UTC, datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier

from app.sequence import telemetry_to_sequence

MODEL_FILE = "model-v2-seq.pkl"
METADATA_FILE = "metadata-v2-seq.json"


def load_sequences(csv_path: str) -> tuple[np.ndarray, np.ndarray, list[str]]:
    df = pd.read_csv(csv_path)
    xs: list[np.ndarray] = []
    ys: list[int] = []
    session_ids: list[str] = []
    for session_id, group in df.groupby("session_id"):
        label = str(group["label"].iloc[0]).strip().lower()
        telemetry: dict = {"keystrokes": [], "mouse_moves": [], "touch_moves": [], "clicks": []}
        for r in group.to_dict("records"):
            et = r["event_type"]
            if et == "keystroke":
                telemetry["keystrokes"].append(
                    {
                        "key": r.get("key"),
                        "down_time": r.get("down_time"),
                        "up_time": r.get("up_time"),
                    }
                )
            elif et == "mouse_move":
                telemetry["mouse_moves"].append(
                    {"x": r.get("x"), "y": r.get("y"), "t": r.get("ts")}
                )
            elif et == "touch_move":
                telemetry["touch_moves"].append(
                    {"x": r.get("x"), "y": r.get("y"), "t": r.get("ts")}
                )
            elif et == "click":
                telemetry["clicks"].append({"x": r.get("x"), "y": r.get("y"), "t": r.get("ts")})
        xs.append(telemetry_to_sequence(telemetry))
        ys.append(1 if label == "human" else 0)
        session_ids.append(str(session_id))
    return np.array(xs), np.array(ys), session_ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the sequence-model shadow candidate")
    parser.add_argument("--data", required=True, help="labeled event CSV")
    parser.add_argument("--output-dir", default=os.environ.get("MODEL_DIR", "/app/models"))
    args = parser.parse_args()

    X, y, session_ids = load_sequences(args.data)
    X_tr, X_te, y_tr, y_te, _sids_tr, sids_te = train_test_split(
        X, y, session_ids, test_size=0.2, stratify=y, random_state=0
    )
    model = MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=2000, random_state=0).fit(
        X_tr, y_tr
    )
    test_accuracy = float(model.score(X_te, y_te))

    os.makedirs(args.output_dir, exist_ok=True)
    joblib.dump(model, os.path.join(args.output_dir, MODEL_FILE))
    metadata = {
        "version": "v2-seq",
        "trained_at": datetime.now(UTC).isoformat(),
        "model_type": "mlp-sequence",
        "max_seq": 64,
        "feature_dim": 8,
        "metrics": {"test_accuracy": round(test_accuracy, 4), "test_sessions": len(sids_te)},
    }
    with open(os.path.join(args.output_dir, METADATA_FILE), "w") as fh:
        json.dump(metadata, fh, indent=2)
    print(f"sequence shadow trained: test_accuracy={test_accuracy:.3f}")


if __name__ == "__main__":
    main()
