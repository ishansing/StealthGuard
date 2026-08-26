import time

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

VALID_FEATURES = {
    "keystroke_mean_hold_ms": 90.5,
    "keystroke_std_hold_ms": 15.2,
    "keystroke_mean_interkey_ms": 110.3,
    "keystroke_std_interkey_ms": 40.1,
    "typing_speed_chars_per_s": 4.0,
    "mouse_mean_speed_px_per_s": 300.4,
    "mouse_std_speed_px_per_s": 90.3,
    "mouse_path_efficiency": 0.82,
    "mouse_idle_ratio": 0.35,
    "mouse_direction_changes": 12,
    "session_duration_ms": 5200,
    "event_count": 145,
}


def make_client() -> TestClient:
    app = create_app(
        settings=Settings(model_dir="/nonexistent", human_threshold=0.8, bot_threshold=0.4)
    )
    return TestClient(app)


def test_score_returns_well_formed_response() -> None:
    with make_client() as client:
        resp = client.post(
            "/score", json={"session_id": "abc", "page": "/login", "features": VALID_FEATURES}
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_id"] == "abc"
    assert 0.0 <= body["humanness_score"] <= 1.0
    assert body["label"] in ("human", "bot", "uncertain")
    assert body["model_version"] == "rule-based"
    assert isinstance(body["reason_codes"], list)
    assert len(body["reason_codes"]) <= 3
    assert body["debug"] == {"threshold_human": 0.8, "threshold_bot": 0.4}


def test_health_reports_rule_based_model() -> None:
    with make_client() as client:
        health = client.get("/health")
        version = client.get("/model/version")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["model_version"] == "rule-based"
    assert health.json()["loaded_at"] is not None
    assert version.json() == {"active": "rule-based", "shadow": None}


def test_score_latency_is_soft_checked() -> None:
    """Spec target p95 < 100 ms. Soft warning only — hardware varies."""
    payload = {"session_id": "lat", "features": VALID_FEATURES}
    with make_client() as client:
        start = time.perf_counter()
        for _ in range(20):
            resp = client.post("/score", json=payload)
            assert resp.status_code == 200
        elapsed_ms = (time.perf_counter() - start) * 1000 / 20
    print(f"[soft] /score average latency {elapsed_ms:.1f} ms (target p95 < 100 ms)")
