"""Environment-backed settings (SPEC §8.2 / §9.4)."""

import os
from dataclasses import dataclass, field


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
    # Per-modality label thresholds (Phase 9 A5), lenient for assistive flows.
    modality_thresholds: dict[str, tuple[float, float]] = field(
        default_factory=lambda: {
            "keyboard": (
                _env_float("HUMAN_THRESHOLD_KEYBOARD", 0.6),
                _env_float("BOT_THRESHOLD_KEYBOARD", 0.2),
            ),
            "touch": (
                _env_float("HUMAN_THRESHOLD_TOUCH", 0.7),
                _env_float("BOT_THRESHOLD_TOUCH", 0.3),
            ),
            "switch": (
                _env_float("HUMAN_THRESHOLD_SWITCH", 0.5),
                _env_float("BOT_THRESHOLD_SWITCH", 0.0),
            ),
        }
    )


def get_settings() -> Settings:
    return Settings()
