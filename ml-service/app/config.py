"""Environment-backed settings (SPEC §8.2 / §9.4)."""

import os
from dataclasses import dataclass


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


@dataclass
class Settings:
    model_dir: str = os.environ.get("MODEL_DIR", "/app/models")
    human_threshold: float = _env_float("HUMAN_THRESHOLD", 0.8)
    bot_threshold: float = _env_float("BOT_THRESHOLD", 0.4)
    model_version_shadow: str | None = os.environ.get("MODEL_VERSION_SHADOW") or None
    db_url: str | None = os.environ.get("DB_URL") or None


def get_settings() -> Settings:
    return Settings()
