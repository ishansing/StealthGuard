#!/usr/bin/env python3
"""Compare the active model vs the sequence-model shadow candidate (Phase 9 A3).

Scores every session in a labeled dataset with both models and reports the
agreement rate plus the disagreement cases. The sequence shadow never affects
a decision (ADR-0009); this report is the evidence for whether to keep it in
shadow or stop pursuing it.

Usage (in the ml-service container):
    python scripts/compare_shadow.py --data /data/sessions.csv --models-dir /app/models
"""

import argparse
import os
import sys
from pathlib import Path

for candidate in ("/app", str(Path(__file__).resolve().parents[1] / "ml-service")):
    if os.path.isdir(candidate):
        sys.path.insert(0, candidate)

import numpy as np  # noqa: E402

from app.scorer import MLScorer, SequenceShadowScorer  # noqa: E402
from app.sequence import telemetry_to_sequence  # noqa: E402
from training.train import load_dataset  # noqa: E402

# Rebuild per-session raw telemetry from the CSV (mirrors training.train.build_telemetry).
import pandas as pd  # noqa: E402


def load_sessions(csv_path: str):
    df = pd.read_csv(csv_path)
    sessions: list[tuple[str, int, dict]] = []
    for session_id, group in df.groupby("session_id"):
        label = str(group["label"].iloc[0]).strip().lower()
        telemetry: dict = {"keystrokes": [], "mouse_moves": [], "touch_moves": [], "clicks": []}
        for r in group.to_dict("records"):
            et = r["event_type"]
            if et == "keystroke":
                telemetry["keystrokes"].append({"key": r.get("key"), "down_time": r.get("down_time"), "up_time": r.get("up_time")})
            elif et == "mouse_move":
                telemetry["mouse_moves"].append({"x": r.get("x"), "y": r.get("y"), "t": r.get("ts")})
            elif et == "touch_move":
                telemetry["touch_moves"].append({"x": r.get("x"), "y": r.get("y"), "t": r.get("ts")})
            elif et == "click":
                telemetry["clicks"].append({"x": r.get("x"), "y": r.get("y"), "t": r.get("ts")})
        sessions.append((str(session_id), 1 if label == "human" else 0, telemetry))
    return sessions


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare active vs sequence-model shadow")
    parser.add_argument("--data", required=True)
    parser.add_argument("--models-dir", default="/app/models")
    parser.add_argument("--out", default="/tmp/compare-shadow.md")
    args = parser.parse_args()

    active = MLScorer(
        os.path.join(args.models_dir, "model.pkl"),
        os.path.join(args.models_dir, "metadata.json"),
        human_threshold=0.8,
        bot_threshold=0.4,
    )
    shadow = SequenceShadowScorer(
        os.path.join(args.models_dir, "model-v2-seq.pkl"),
        os.path.join(args.models_dir, "metadata-v2-seq.json"),
    )

    X, _ = load_dataset(args.data)
    sessions = load_sessions(args.data)
    assert len(X) == len(sessions)

    active_labels: list[str] = []
    shadow_labels: list[str] = []
    disagreements: list[tuple[str, str, float]] = []
    for i, (session_id, y, telemetry) in enumerate(sessions):
        features = dict(X.iloc[i])
        active_score = active.score(features).humanness_score
        shadow_score = shadow.score(telemetry)
        active_label = "human" if active_score >= 0.8 else "bot"
        shadow_label = "human" if shadow_score >= 0.8 else "bot"
        active_labels.append(active_label)
        shadow_labels.append(shadow_label)
        if active_label != shadow_label:
            disagreements.append((session_id, active_label, shadow_score))

    agreement = float(np.mean(np.array(active_labels) == np.array(shadow_labels)))
    active_acc = float(np.mean(np.array([1 if l == "human" else 0 for l in active_labels]) == np.array([s[1] for s in sessions])))
    shadow_acc = float(np.mean(np.array([1 if l == "human" else 0 for l in shadow_labels]) == np.array([s[1] for s in sessions])))

    report = f"""# Active vs sequence-model shadow comparison

Active model: `{active.version}` · Sequence shadow: `{shadow.version}`

| metric | active | sequence shadow |
|---|---|---|
| accuracy on dataset | {active_acc:.2%} | {shadow_acc:.2%} |
| agreement | {agreement:.2%} | — |

## Disagreement cases ({len(disagreements)})
"""
    for session_id, active_label, shadow_score in disagreements[:15]:
        report += f"- `{session_id[:12]}…`: active={active_label}, shadow_score={shadow_score:.3f}\n"

    Path(args.out).write_text(report)
    print(f"agreement={agreement:.2%} active_acc={active_acc:.2%} shadow_acc={shadow_acc:.2%} disagreements={len(disagreements)}")
    print(report)


if __name__ == "__main__":
    main()