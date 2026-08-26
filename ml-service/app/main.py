"""StealthGuard ML Service (FastAPI). Endpoints per SPEC §8.2."""

import json
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, HTTPException, Request

from app.config import Settings, get_settings
from app.features import compute_features
from app.models import (
    FeaturesRequest,
    FeaturesResponse,
    HealthResponse,
    ModelVersionResponse,
    ReasonCode,
    ScoreRequest,
    ScoreResponse,
)
from app.pii import contains_pii
from app.scorer import Scorer, ScoreResult, load_scorer

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = app.state.settings
    app.state.scorer, app.state.shadow_scorer = load_scorer(
        settings.model_dir,
        settings.human_threshold,
        settings.bot_threshold,
        settings.model_version_shadow,
    )
    app.state.loaded_at = datetime.now(UTC).isoformat()
    if app.state.shadow_scorer is not None:
        logger.info("shadow scorer loaded: %s", settings.model_version_shadow)
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="StealthGuard ML Service", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings or get_settings()

    async def pii_guard(request: Request) -> None:
        try:
            body = await request.json()
        except json.JSONDecodeError:
            return
        if contains_pii(body):
            raise HTTPException(status_code=422, detail="Request contains PII-shaped fields")

    def _result_to_response(result: ScoreResult, session_id: str) -> ScoreResponse:
        return ScoreResponse(
            session_id=session_id,
            humanness_score=result.humanness_score,
            label=result.label,
            model_version=result.model_version,
            reason_codes=[ReasonCode(code=rc.code, weight=rc.weight) for rc in result.reason_codes],
            debug={
                "threshold_human": app.state.settings.human_threshold,
                "threshold_bot": app.state.settings.bot_threshold,
            },
        )

    @app.get("/health", response_model=HealthResponse, tags=["ops"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            model_version=app.state.scorer.version,
            loaded_at=app.state.loaded_at,
        )

    @app.get("/model/version", response_model=ModelVersionResponse, tags=["ops"])
    def model_version() -> ModelVersionResponse:
        active = app.state.scorer.version
        shadow = None
        if app.state.shadow_scorer is not None:
            shadow = app.state.settings.model_version_shadow
        return ModelVersionResponse(active=active, shadow=shadow)

    @app.post(
        "/score", response_model=ScoreResponse, dependencies=[Depends(pii_guard)], tags=["scoring"]
    )
    def score(req: ScoreRequest) -> ScoreResponse:
        scorer: Scorer = app.state.scorer
        result = scorer.score(req.features)
        if app.state.shadow_scorer is not None:
            shadow_result = app.state.shadow_scorer.score(req.features)
            logger.info(
                "shadow session_id=%s score=%s model_version=%s",
                req.session_id,
                shadow_result.humanness_score,
                shadow_result.model_version,
            )
        return _result_to_response(result, req.session_id)

    @app.post(
        "/features",
        response_model=FeaturesResponse,
        dependencies=[Depends(pii_guard)],
        tags=["scoring"],
    )
    def features(req: FeaturesRequest) -> FeaturesResponse:
        """Compute the canonical feature vector from raw telemetry (§6.2)."""
        return FeaturesResponse(features=compute_features(req.model_dump()))

    return app


app = create_app()
