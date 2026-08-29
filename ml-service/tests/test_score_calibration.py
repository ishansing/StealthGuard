"""Phase 9 A2 — score calibration.

Verify the calibration curve of the deployed (calibrated) model on a
held-out fold is monotonic and within tolerance of the identity line, so
`humanness_score = 0.8` means a stable ~80% confidence across retrains.
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from app.scorer import MLScorer
from training.train import train

N_HUMAN = 300
N_BOT = 300


def _session_events(rng: np.random.Generator, label: str, session_id: str) -> list[list]:
    """Generate a realistic session's raw events (event-per-row CSV shape).

    Only keystroke timing discriminates the classes, with heavily overlapping
    distributions, so the base model is genuinely uncertain on a meaningful
    fraction of sessions — exactly what calibration fixes. Mouse behavior is
    identical noise for both classes (no extra separation).
    """
    rows: list[list] = []
    t = 0.0
    for i in range(12):
        if label == "human":
            hold = max(0.04, 0.09 + rng.normal(0, 0.04))
            inter = max(0.03, 0.13 + rng.normal(0, 0.09))
        else:
            hold = max(0.04, 0.06 + rng.normal(0, 0.03))
            inter = max(0.03, 0.07 + rng.normal(0, 0.06))
        rows.append(
            [session_id, label, "keystroke", "", f"k{i}", round(t, 3), round(t + hold, 3), "", ""]
        )
        t += hold + inter
    x, y = 60.0, 60.0
    for i in range(8):
        x += rng.normal(20, 30)
        y += rng.normal(15, 30)
        t += rng.uniform(0.1, 0.4)
        rows.append(
            [session_id, label, "mouse_move", round(t, 3), "", "", "", round(x, 1), round(y, 1)]
        )
    rows.append(
        [session_id, label, "click", round(t + 0.05, 3), "", "", "", round(x, 1), round(y, 1)]
    )
    return rows


def _dataset(tmp_path):
    rng = np.random.default_rng(42)
    rows: list[list] = []
    for i in range(N_HUMAN):
        rows += _session_events(rng, "human", f"h-{i}")
    for i in range(N_BOT):
        rows += _session_events(rng, "bot", f"b-{i}")
    csv = tmp_path / "calib.csv"
    pd.DataFrame(
        rows,
        columns=[
            "session_id",
            "label",
            "event_type",
            "ts",
            "key",
            "down_time",
            "up_time",
            "x",
            "y",
        ],
    ).to_csv(csv, index=False)
    return csv


def calibration_curve(y_true: np.ndarray, y_score: np.ndarray, n_bins: int = 10):
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    indices = np.clip(np.digitize(y_score, bins) - 1, 0, n_bins - 1)
    predicted: list[float] = []
    observed: list[float] = []
    for b in range(n_bins):
        mask = indices == b
        if mask.sum() == 0:
            continue
        predicted.append(float(y_score[mask].mean()))
        observed.append(float(y_true[mask].mean()))
    return np.array(predicted), np.array(observed)


def test_calibration_moves_curve_toward_identity(tmp_path) -> None:
    csv = _dataset(tmp_path)
    from training.train import load_dataset

    X, y = load_dataset(str(csv))
    X_fitcal, X_test, y_fitcal, y_test = train_test_split(
        X, y, test_size=0.25, stratify=y, random_state=0
    )
    out = tmp_path / "model"
    metadata = train(X_fitcal, y_fitcal, str(out), version="calib-v1")
    assert metadata["metrics"]["calibration"]["fitted"] is True, metadata["metrics"]["calibration"]

    raw_scorer = MLScorer(str(out / "model.pkl"), str(out / "metadata.json"), 0.8, 0.4)
    cal_scorer = MLScorer(
        str(out / "model.pkl"),
        str(out / "metadata.json"),
        0.8,
        0.4,
        calibrated_path=str(out / "calibrated.pkl"),
    )
    assert cal_scorer.calibrated is not None

    def curve(scorer):
        scores = np.array([scorer.score(dict(row)).humanness_score for _, row in X_test.iterrows()])
        return calibration_curve(y_test, scores)

    p_raw, o_raw = curve(raw_scorer)
    p_cal, o_cal = curve(cal_scorer)
    assert len(p_cal) >= 2, "calibration curve needs at least two populated bins"

    # Monotonic increasing predicted bin centers.
    assert np.all(np.diff(p_cal) > -1e-9), "predicted bin centers must be monotonic increasing"

    # Calibration must move the curve closer to the identity line, and stay
    # within a bounded tolerance of it.
    raw_residual = float(np.mean(np.abs(o_raw - p_raw)))
    cal_residual = float(np.mean(np.abs(o_cal - p_cal)))
    assert cal_residual <= 0.25, f"calibrated curve off identity: {list(zip(p_cal, o_cal))}"
    assert (
        cal_residual <= raw_residual
    ), f"calibration did not improve: raw={raw_residual:.3f} calibrated={cal_residual:.3f}"
