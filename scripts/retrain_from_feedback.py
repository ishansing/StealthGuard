#!/usr/bin/env python3
"""Retrain from reviewer feedback and produce a shadow-mode comparison report.

Folds `feedback` corrections (SPEC §9.6) into the seed training set, trains a
candidate model v2, saves it as the shadow artifact, and reports how it
compares to the active model v1 (SPEC §9.5).

Runs inside the ml-service container (has psycopg + the app modules):
    make retrain
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

sys.path.insert(0, "/app")  # ml-service root: training/ + installed app package

from app.scorer import MLScorer  # noqa: E402
from training.train import load_dataset, train  # noqa: E402

CSV_COLUMNS = ["session_id", "label", "event_type", "ts", "key", "down_time", "up_time", "x", "y"]


def fetch_feedback_sessions(db_url: str) -> list[tuple[str, str]]:
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT session_id, corrected_label FROM feedback WHERE corrected_label IS NOT NULL"
            )
            return [(str(row[0]), str(row[1])) for row in cur.fetchall()]


def fetch_events(db_url: str, session_id: str) -> list[dict]:
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT event_type, payload FROM telemetry_events WHERE session_id = %s",
                (session_id,),
            )
            return [{"event_type": r[0], "payload": r[1]} for r in cur.fetchall()]


def events_to_rows(session_id: str, label: str, events: list[dict]) -> list[list]:
    rows: list[list] = []
    for e in events:
        p = e["payload"] or {}
        et = e["event_type"]
        if et == "keystroke":
            rows.append([session_id, label, "keystroke", "", p.get("key"), p.get("down_time"), p.get("up_time"), "", ""])
        elif et in ("mouse_move", "touch_move", "click"):
            rows.append([session_id, label, et, p.get("t"), "", "", "", p.get("x"), p.get("y")])
    return rows


def score_to_label(score: float) -> str:
    return "human" if score >= 0.8 else "bot"


def evaluate(scorer: MLScorer, X: pd.DataFrame, y: np.ndarray) -> tuple[float, np.ndarray]:
    preds = np.array([1 if score_to_label(scorer.score(dict(row)).humanness_score) == "human" else 0 for _, row in X.iterrows()])
    return float((preds == y).mean()), preds


def main() -> None:
    parser = argparse.ArgumentParser(description="Fold feedback into training and report shadow comparison")
    parser.add_argument("--data", required=True, help="seed CSV (e.g. /data/sessions.csv)")
    parser.add_argument("--models-dir", default="/app/models")
    parser.add_argument("--report", default="retrain-report.md")
    parser.add_argument("--db-url", default=os.environ.get("DB_URL"), help="Postgres URL (default DB_URL)")
    parser.add_argument("--version", default="v2")
    parser.add_argument("--shadow-version", default="v2")
    args = parser.parse_args()

    if not args.db_url:
        raise SystemExit("DB_URL is required (set --db-url or DB_URL)")

    seed = pd.read_csv(args.data)
    feedback_sessions = fetch_feedback_sessions(args.db_url)
    folded: list[list] = []
    labels = {"human": 0, "bot": 0}
    for session_id, corrected_label in feedback_sessions:
        events = fetch_events(args.db_url, session_id)
        if not events:
            continue
        folded.extend(events_to_rows(session_id, corrected_label, events))
        labels[corrected_label] += 1

    combined = pd.DataFrame(folded, columns=CSV_COLUMNS) if folded else pd.DataFrame(columns=CSV_COLUMNS)
    combined = pd.concat([seed, combined], ignore_index=True)
    combined_path = Path(args.data).with_name("sessions-augmented.csv")
    combined.to_csv(combined_path, index=False)

    X, y = load_dataset(str(combined_path))
    X_tr, X_val, y_tr, y_val = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)

    with tempfile.TemporaryDirectory() as tmp:
        train(X_tr, y_tr, tmp, version=args.version)
        models = Path(args.models_dir)
        models.mkdir(parents=True, exist_ok=True)
        shutil.copy(Path(tmp) / "model.pkl", models / f"model-{args.shadow_version}.pkl")
        shutil.copy(Path(tmp) / "metadata.json", models / f"metadata-{args.shadow_version}.json")
        if (Path(tmp) / "explainer.pkl").exists():
            shutil.copy(Path(tmp) / "explainer.pkl", models / f"explainer-{args.shadow_version}.pkl")
        if (Path(tmp) / "calibrated.pkl").exists():
            shutil.copy(Path(tmp) / "calibrated.pkl", models / f"calibrated-{args.shadow_version}.pkl")

    active = MLScorer(
        str(models / "model.pkl"),
        str(models / "metadata.json"),
        human_threshold=0.8,
        bot_threshold=0.4,
    )
    shadow = MLScorer(
        str(models / f"model-{args.shadow_version}.pkl"),
        str(models / f"metadata-{args.shadow_version}.json"),
        human_threshold=0.8,
        bot_threshold=0.4,
        explainer_path=str(models / f"explainer-{args.shadow_version}.pkl")
        if (models / f"explainer-{args.shadow_version}.pkl").exists()
        else None,
    )

    acc_active, preds_active = evaluate(active, X_val, y_val)
    acc_shadow, preds_shadow = evaluate(shadow, X_val, y_val)
    agreement = float((preds_active == preds_shadow).mean())

    human_mask = y_val == 1
    bot_mask = y_val == 0
    report = f"""# StealthGuard retrain report

Generated: {datetime.now(timezone.utc).isoformat()}

## Feedback folded in
- corrected sessions: {len(feedback_sessions)} (human: {labels['human']}, bot: {labels['bot']})
- combined training data: {len(combined)} event rows, {len(X)} sessions
- combined CSV: {combined_path}

## Validation (holdout, {len(X_val)} sessions)
| model | accuracy |
|---|---|
| active `{active.version}` | {acc_active:.2%} |
| shadow `{shadow.version}` | {acc_shadow:.2%} |

agreement rate: {agreement:.2%}

per-class accuracy (active / shadow):
- human: {float((preds_active[human_mask] == y_val[human_mask]).mean()):.2%} / {float((preds_shadow[human_mask] == y_val[human_mask]).mean()):.2%}
- bot: {float((preds_active[bot_mask] == y_val[bot_mask]).mean()):.2%} / {float((preds_shadow[bot_mask] == y_val[bot_mask]).mean()):.2%}

## Recommendation
Promote shadow `{shadow.version}` to active (copy `model-{args.shadow_version}.pkl` to
`model.pkl` and restart ml-service) if its holdout accuracy exceeds the active
model; otherwise keep `{active.version}`.
"""
    Path(args.report).write_text(report)
    print(report)


if __name__ == "__main__":
    main()