"""Training pipeline (SPEC §9.1/§9.2/§9.4).

Usage:

    python -m training.train --data sessions.csv --output-dir /app/models [--register-db]

Data format: one row per raw event (the shape the bot simulator emits):

    session_id,label,event_type,ts,key,down_time,up_time,x,y

- `label` is `human` or `bot` on every row of a session.
- `keystroke` rows: `key`, `down_time`, `up_time` (epoch seconds).
- `mouse_move` / `touch_move` / `click` rows: `ts`, `x`, `y`.

Train a Logistic Regression and a Random Forest, compare by cross-validated
AUC, deploy the winner, and always keep LR coefficients for reason codes
(Random Forest has no coefficients — §9.3 explainability needs them).
"""

import argparse
import json
import logging
import os
from datetime import UTC, datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler

from app.features import FEATURE_NAMES, compute_features
from app.scorer import Calibrator

logger = logging.getLogger(__name__)

METADATA_FILE = "metadata.json"
MODEL_FILE = "model.pkl"
EXPLAINER_FILE = "explainer.pkl"
CALIBRATED_FILE = "calibrated.pkl"

# Tie-break margin: Random Forest must beat Logistic Regression by this much
# CV-AUC to be deployed, otherwise the explainable LR wins.
RF_MARGIN = 0.02


def build_telemetry(group: pd.DataFrame) -> dict:
    telemetry: dict = {"keystrokes": [], "mouse_moves": [], "touch_moves": [], "clicks": []}
    for row in group.itertuples(index=False):
        event_type = row.event_type
        if event_type == "keystroke":
            telemetry["keystrokes"].append(
                {"key": row.key, "down_time": row.down_time, "up_time": row.up_time}
            )
        elif event_type == "mouse_move":
            telemetry["mouse_moves"].append({"x": row.x, "y": row.y, "t": row.ts})
        elif event_type == "touch_move":
            telemetry["touch_moves"].append({"x": row.x, "y": row.y, "t": row.ts})
        elif event_type == "click":
            telemetry["clicks"].append({"x": row.x, "y": row.y, "t": row.ts})
    return telemetry


def load_dataset(csv_path: str) -> tuple[pd.DataFrame, np.ndarray]:
    df = pd.read_csv(csv_path)
    rows: list[dict] = []
    for session_id, group in df.groupby("session_id"):
        label = str(group["label"].iloc[0]).strip().lower()
        if label not in ("human", "bot"):
            raise ValueError(f"unknown label {label!r} for session {session_id}")
        feats = compute_features(build_telemetry(group))
        feats["label"] = 1 if label == "human" else 0
        rows.append(feats)
    if not rows:
        raise ValueError("no sessions found in CSV")
    data = pd.DataFrame(rows)
    X = data[FEATURE_NAMES].astype(float)
    y = data["label"].to_numpy().astype(int)
    return X, y


def cv_auc(X: np.ndarray, y: np.ndarray, model, cv: int) -> float:
    if cv < 2:
        return 0.0
    try:
        return float(np.mean(cross_val_score(model, X, y, cv=cv, scoring="roc_auc")))
    except ValueError:
        return 0.0


def train(
    X: pd.DataFrame,
    y: np.ndarray,
    output_dir: str,
    version: str,
    register_db: str | None = None,
    cv: int | None = None,
) -> dict:
    """Train, compare, calibrate, deploy. Returns metadata dict (and registers if asked).

    The data is split into a fit set and a calibration set (stratified); the
    deployed model's probabilities are calibrated (Platt/isotonic via
    CalibratedClassifierCV) on the calibration set so humanness_score has a
    stable meaning across retrains (Phase 9 A2, ADR-0008).
    """
    os.makedirs(output_dir, exist_ok=True)

    X_fit, X_cal, y_fit, y_cal = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)

    scaler = StandardScaler().fit(X_fit)
    Xz_fit = pd.DataFrame(scaler.transform(X_fit), columns=X_fit.columns)
    Xz_cal = pd.DataFrame(scaler.transform(X_cal), columns=X_cal.columns)

    lr = LogisticRegression(max_iter=1000, random_state=0).fit(Xz_fit, y_fit)
    rf = RandomForestClassifier(n_estimators=100, random_state=0).fit(Xz_fit, y_fit)

    if cv is None:
        counts = np.bincount(y_fit)
        cv = min(3, int(counts.min())) if counts.min() >= 2 else 1
    lr_auc = cv_auc(Xz_fit.to_numpy(), y_fit, LogisticRegression(max_iter=1000, random_state=0), cv)
    rf_auc = cv_auc(
        Xz_fit.to_numpy(), y_fit, RandomForestClassifier(n_estimators=100, random_state=0), cv
    )

    if rf_auc > lr_auc + RF_MARGIN:
        deployed, model_type = rf, "random_forest"
    else:
        deployed, model_type = lr, "logistic"

    joblib.dump(deployed, os.path.join(output_dir, MODEL_FILE))
    if model_type == "random_forest":
        joblib.dump(lr, os.path.join(output_dir, EXPLAINER_FILE))

    calibration = _fit_calibration(deployed, Xz_fit, y_fit, Xz_cal, y_cal, output_dir)

    metrics = {
        "lr_cv_auc": round(lr_auc, 4),
        "rf_cv_auc": round(rf_auc, 4),
        "train_accuracy": round(float(accuracy_score(y_fit, deployed.predict(Xz_fit))), 4),
        "calibration": calibration,
    }
    metadata = {
        "version": version,
        "trained_at": datetime.now(UTC).isoformat(),
        "model_type": model_type,
        "metrics": metrics,
        "feature_list": FEATURE_NAMES,
        "means": dict(zip(FEATURE_NAMES, [float(v) for v in scaler.mean_])),
        "stds": dict(zip(FEATURE_NAMES, [float(v) for v in scaler.scale_])),
    }
    with open(os.path.join(output_dir, METADATA_FILE), "w") as fh:
        json.dump(metadata, fh, indent=2)

    if register_db:
        _register_in_db(register_db, metadata)

    logger.info(
        "trained %s v%s: lr_auc=%s rf_auc=%s cv=%s calibration=%s",
        model_type,
        version,
        lr_auc,
        rf_auc,
        cv,
        calibration.get("method"),
    )
    return metadata


def _fit_calibration(
    deployed,
    Xz_fit: pd.DataFrame,
    y_fit: np.ndarray,
    Xz_cal: pd.DataFrame,
    y_cal: np.ndarray,
    output_dir: str,
) -> dict:
    """Calibrate the deployed model's raw output on the calibration split.

    Fits Platt (sigmoid) and isotonic calibrators on the base model's
    predicted probabilities and keeps the better one by Brier score evaluated
    on the FIT split (data the calibrator never saw), which penalizes
    overfitting the small calibration set (Phase 9 A2, ADR-0008).
    """
    not_fitted = {"method": None, "fitted": False, "n_samples": len(y_cal)}
    if min(np.bincount(y_cal)) < 5:
        return not_fitted
    cal_proba = deployed.predict_proba(Xz_cal)[:, 1]
    fit_proba = deployed.predict_proba(Xz_fit)[:, 1]
    best: tuple[float, Calibrator, str] | None = None
    for method in ("sigmoid", "isotonic"):
        try:
            calibrator = Calibrator.fit(method, cal_proba, y_cal)
            brier = float(brier_score_loss(y_fit, calibrator.calibrate_array(fit_proba)))
            if best is None or brier < best[0]:
                best = (brier, calibrator, method)
        except Exception as exc:  # noqa: BLE001 - calibration is best-effort
            logger.warning("calibration method %s failed: %s", method, exc)
    if best is None:
        return not_fitted
    brier, calibrator, method = best
    joblib.dump(calibrator, os.path.join(output_dir, CALIBRATED_FILE))
    return {
        "method": method,
        "fitted": True,
        "brier_score": round(brier, 4),
        "n_samples": len(y_cal),
    }


def _register_in_db(db_url: str, metadata: dict) -> None:
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_registry (version, trained_at, metrics_json, is_active, feature_list)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (version) DO UPDATE SET
                    trained_at = EXCLUDED.trained_at,
                    metrics_json = EXCLUDED.metrics_json,
                    is_active = EXCLUDED.is_active,
                    feature_list = EXCLUDED.feature_list
                """,
                (
                    metadata["version"],
                    metadata["trained_at"],
                    json.dumps(metadata["metrics"]),
                    True,
                    json.dumps(metadata["feature_list"]),
                ),
            )
        conn.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the StealthGuard bot-detection model")
    parser.add_argument("--data", required=True, help="path to labeled event CSV")
    parser.add_argument("--output-dir", default=os.environ.get("MODEL_DIR", "/app/models"))
    parser.add_argument("--version", default="v1")
    parser.add_argument(
        "--register-db",
        nargs="?",
        const=os.environ.get("DB_URL"),
        default=None,
        help="Postgres URL to register the model (defaults to DB_URL)",
    )
    args = parser.parse_args()

    X, y = load_dataset(args.data)
    train(X, y, args.output_dir, args.version, register_db=args.register_db)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
