from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health() -> None:
    app = create_app(settings=Settings(model_dir="/nonexistent"))
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["model_version"] == "rule-based"
    assert body["loaded_at"] is not None
