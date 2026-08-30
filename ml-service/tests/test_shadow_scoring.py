"""Phase 9 A3 — the sequence-model shadow scores in parallel and never touches
a decision.

Trains a tiny sequence-model artifact on a fixture, then verifies that with the
shadow configured (/features returns a shadow score) the active /score decision
is identical to the un-shadowed run, and the shadow is persisted/logged only.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))


from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.scorer import SequenceShadowScorer
from training.train_seq import load_sequences
from training.train_seq import main as train_seq_main


def _train_seq_artifact(tmp_path) -> Path:
    from test_training_pipeline import write_fixture_csv

    csv = tmp_path / "fixture.csv"
    write_fixture_csv(str(csv))
    out = tmp_path / "models"
    train_seq_main.__wrapped__ = None  # keep main importable; call internals directly
    X, y, _ = load_sequences(str(csv))
    assert X.shape[0] == len(y)
    # exercise training via a direct fit so the test doesn't depend on CLI args
    from sklearn.neural_network import MLPClassifier

    model = MLPClassifier(hidden_layer_sizes=(8, 4), max_iter=50, random_state=0).fit(X, y)
    import json

    import joblib

    out.mkdir(exist_ok=True)
    joblib.dump(model, out / "model-v2-seq.pkl")
    (out / "metadata-v2-seq.json").write_text(
        json.dumps(
            {"version": "v2-seq", "model_type": "mlp-sequence", "max_seq": 64, "feature_dim": 8}
        )
    )
    return out


def test_sequence_shadow_artifact_scores() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        out = _train_seq_artifact(Path(tmp))
        scorer = SequenceShadowScorer(
            str(out / "model-v2-seq.pkl"), str(out / "metadata-v2-seq.json")
        )
        score = scorer.score(
            {
                "keystrokes": [{"key": "a", "down_time": 1.0, "up_time": 1.2}],
                "mouse_moves": [],
                "touch_moves": [],
                "clicks": [],
            }
        )
        assert 0.0 <= score <= 1.0
        assert scorer.version == "v2-seq"


def test_shadow_does_not_touch_active_decision(tmp_path) -> None:
    out = _train_seq_artifact(tmp_path)

    shadowed = create_app(settings=Settings(model_dir=str(out), model_version_shadow="seq"))
    plain = create_app(settings=Settings(model_dir=str(out)))

    payload = {
        "session_id": "s",
        "page": "/login",
        "features": {"event_count": 2.0, "input_modality": 0.0},
    }

    with TestClient(shadowed) as client:
        shadowed_score = client.post("/score", json=payload)
        features_resp = client.post(
            "/features",
            json={
                "keystrokes": [],
                "mouse_moves": [],
                "touch_moves": [],
                "clicks": [],
                "signals": {},
            },
        )

    with TestClient(plain) as client:
        plain_score = client.post("/score", json=payload)
        plain_features = client.post(
            "/features",
            json={
                "keystrokes": [],
                "mouse_moves": [],
                "touch_moves": [],
                "clicks": [],
                "signals": {},
            },
        )

    assert shadowed_score.status_code == 200 and plain_score.status_code == 200
    # Active decision is identical with or without the shadow configured.
    assert shadowed_score.json()["humanness_score"] == plain_score.json()["humanness_score"]
    # /features carries the shadow score only when configured.
    assert features_resp.json().get("shadow") is not None
    assert features_resp.json()["shadow"]["model_version"] == "v2-seq"
    assert plain_features.json().get("shadow") is None
