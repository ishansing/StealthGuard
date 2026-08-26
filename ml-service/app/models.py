"""Pydantic models matching SPEC §6.3 / §8.2."""

from pydantic import BaseModel


class ScoreRequest(BaseModel):
    session_id: str
    page: str | None = None
    features: dict[str, float]


class FeaturesRequest(BaseModel):
    """Raw telemetry (§6.2) from which the canonical feature vector is computed."""

    keystrokes: list[dict] = []
    mouse_moves: list[dict] = []
    touch_moves: list[dict] = []
    clicks: list[dict] = []


class FeaturesResponse(BaseModel):
    features: dict[str, float]


class ReasonCode(BaseModel):
    code: str
    weight: float


class ScoreResponse(BaseModel):
    session_id: str
    humanness_score: float
    label: str
    model_version: str
    reason_codes: list[ReasonCode]
    debug: dict[str, float]


class HealthResponse(BaseModel):
    status: str
    model_version: str
    loaded_at: str | None = None


class ModelVersionResponse(BaseModel):
    active: str
    shadow: str | None = None
