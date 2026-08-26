from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.pii import contains_pii

PII_SHAPED_REQUESTS = [
    {"session_id": "s", "features": {"email": "a@b.c"}},
    {"session_id": "s", "phone": "1234567890", "features": {}},
    {"session_id": "s", "features": {"keystroke_mean_hold_ms": 1.0}, "nested": {"aadhaar_no": 1}},
    {"session_id": "s", "features": {"passport_number": "P123"}},
]


def make_client() -> TestClient:
    app = create_app(settings=Settings(model_dir="/nonexistent"))
    return TestClient(app)


def test_pii_shaped_requests_rejected_with_422() -> None:
    with make_client() as client:
        for payload in PII_SHAPED_REQUESTS:
            resp = client.post("/score", json=payload)
            assert resp.status_code == 422, payload


def test_clean_request_accepted() -> None:
    with make_client() as client:
        resp = client.post(
            "/score",
            json={"session_id": "s", "features": {"keystroke_std_hold_ms": 20.0}},
        )
    assert resp.status_code == 200


def test_contains_pii_scan() -> None:
    assert contains_pii({"a": {"email": "x"}}) is True
    assert contains_pii({"name": "Alice"}) is True
    assert contains_pii({"user_agent": "Mozilla/5.0"}) is False
    assert contains_pii({"filename": "notes.txt"}) is False
    assert contains_pii({"features": {"keystroke_mean_hold_ms": 1.0}}) is False
    assert contains_pii({"list": [{"phone": 1}]}) is True
