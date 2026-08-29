"""Pydantic models matching SPEC §6.3 / §8.2."""

from pydantic import BaseModel


class ScoreRequest(BaseModel):
    session_id: str
    page: str | None = None
    features: dict[str, float]


class FeaturesRequest(BaseModel):
    """Raw telemetry (§6.2 + Phase 9 signals) from which the canonical feature vector is computed."""

    keystrokes: list[dict] = []
    mouse_moves: list[dict] = []
    touch_moves: list[dict] = []
    clicks: list[dict] = []
    signals: dict = {}


class ShadowScore(BaseModel):
    """Shadow-model output (Phase 9 A3) — logged, never a decision."""

    score: float
    model_version: str


class FeaturesResponse(BaseModel):
    features: dict[str, float]
    shadow: ShadowScore | None = None


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
