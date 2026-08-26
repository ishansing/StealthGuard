import json

import pandas as pd

from app.features import FEATURE_NAMES
from app.scorer import MLScorer
from training.train import load_dataset, train

COLUMNS = ["session_id", "label", "event_type", "ts", "key", "down_time", "up_time", "x", "y"]


def _human_session(sid: str, base: float) -> list[list]:
    rows: list[list] = []
    t = base
    for i in range(8):
        down = t
        up = t + 0.08 + (i % 3) * 0.02
        rows.append([sid, "human", "keystroke", "", f"key{i}", down, up, "", ""])
        t = up + 0.10 + (i % 2) * 0.05
    x = 100.0
    for i in range(6):
        rows.append(
            [sid, "human", "mouse_move", t, "", "", "", x + i * 10 + (i % 2), 200 + (i % 3) * 20]
        )
        t += 0.05
    return rows


def _bot_session(sid: str, base: float) -> list[list]:
    rows: list[list] = []
    t = base
    for i in range(8):
        down = t
        up = t + 0.08
        rows.append([sid, "bot", "keystroke", "", f"key{i}", down, up, "", ""])
        t = up + 0.08
    x = 100.0
    for i in range(6):
        rows.append([sid, "bot", "mouse_move", t, "", "", "", x + i * 10, 200.0])
        t += 0.05
    return rows


def write_fixture_csv(path: str) -> None:
    rows: list[list] = []
    for i in range(3):
        rows += _human_session(f"human-{i}", 1000.0 + i * 10)
        rows += _bot_session(f"bot-{i}", 5000.0 + i * 10)
    pd.DataFrame(rows, columns=COLUMNS).to_csv(path, index=False)


def test_load_dataset(tmp_path) -> None:
    csv = tmp_path / "fixture.csv"
    write_fixture_csv(str(csv))

    X, y = load_dataset(str(csv))
    assert X.shape[1] == len(FEATURE_NAMES)
    assert X.shape[0] == 6
    assert set(y.tolist()) == {0, 1}


def test_train_produces_valid_artifacts(tmp_path) -> None:
    csv = tmp_path / "fixture.csv"
    write_fixture_csv(str(csv))
    out = tmp_path / "out"

    X, y = load_dataset(str(csv))
    metadata = train(X, y, str(out), version="test-v1")

    assert (out / "model.pkl").exists()
    assert (out / "metadata.json").exists()
    assert metadata["version"] == "test-v1"
    assert metadata["feature_list"] == FEATURE_NAMES
    assert set(metadata["means"]) == set(FEATURE_NAMES)
    assert set(metadata["stds"]) == set(FEATURE_NAMES)
    assert "lr_cv_auc" in metadata["metrics"]
    assert "rf_cv_auc" in metadata["metrics"]
    assert metadata["model_type"] in ("logistic", "random_forest")


def test_ml_scorer_loads_artifacts_and_scores(tmp_path) -> None:
    csv = tmp_path / "fixture.csv"
    write_fixture_csv(str(csv))
    out = tmp_path / "out"
    X, y = load_dataset(str(csv))
    train(X, y, str(out), version="test-v1")

    scorer = MLScorer(str(out / "model.pkl"), str(out / "metadata.json"), 0.8, 0.4)
    assert scorer.version == "test-v1"

    result = scorer.score({f: 0.0 for f in FEATURE_NAMES})
    assert 0.0 <= result.humanness_score <= 1.0
    assert len(result.reason_codes) <= 3
    assert result.model_version == "test-v1"

    bot = scorer.score({"keystroke_std_hold_ms": 0.0, "keystroke_std_interkey_ms": 0.0})
    human = scorer.score({"keystroke_std_hold_ms": 30.0, "keystroke_std_interkey_ms": 60.0})
    assert bot.humanness_score < human.humanness_score


def test_metadata_is_valid_json(tmp_path) -> None:
    csv = tmp_path / "fixture.csv"
    write_fixture_csv(str(csv))
    out = tmp_path / "out"
    X, y = load_dataset(str(csv))
    train(X, y, str(out), version="test-v1")

    metadata = json.loads((out / "metadata.json").read_text())
    assert isinstance(metadata["means"], dict)
    assert isinstance(metadata["stds"], dict)
    assert isinstance(metadata["metrics"], dict)
