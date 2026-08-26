from fastapi.testclient import TestClient

from app.config import Settings
from app.features import FEATURE_NAMES
from app.main import create_app


def make_client() -> TestClient:
    app = create_app(settings=Settings(model_dir="/nonexistent"))
    return TestClient(app)


def test_features_computes_vector_from_raw_telemetry() -> None:
    with make_client() as client:
        resp = client.post(
            "/features",
            json={
                "keystrokes": [
                    {"key": "a", "down_time": 0.0, "up_time": 0.09},
                    {"key": "b", "down_time": 0.25, "up_time": 0.36},
                ],
                "mouse_moves": [
                    {"x": 100, "y": 100, "t": 0.0},
                    {"x": 120, "y": 130, "t": 0.2},
                ],
                "touch_moves": [],
                "clicks": [{"x": 50, "y": 60, "t": 0.5}],
            },
        )
    assert resp.status_code == 200
    features = resp.json()["features"]
    assert set(features) == set(FEATURE_NAMES)
    assert features["event_count"] == 5
    assert features["keystroke_mean_hold_ms"] > 0
    assert features["mouse_mean_speed_px_per_s"] > 0


def test_features_empty_payload_is_all_zero() -> None:
    with make_client() as client:
        resp = client.post("/features", json={})
    assert resp.status_code == 200
    assert all(v == 0.0 for v in resp.json()["features"].values())


def test_features_rejects_pii() -> None:
    with make_client() as client:
        resp = client.post("/features", json={"keystrokes": [{"email": "x@y.z"}]})
    assert resp.status_code == 422
