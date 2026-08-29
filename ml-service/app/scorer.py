"""Scorers: baseline rule-based scorer and the trained ML scorer.

Both return the same ScoreResult (SPEC §6.3): a [0,1] humanness score, a
label by threshold, and top-3 explainable reason codes (§9.3).
"""

import json
import math
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import ClassVar

import joblib

# Human-readable reason codes per feature, keyed by which way the
# contribution pushed the score. "human" = pushed toward human-like,
# "bot" = pushed toward bot-like.
LABEL_DICT: dict[str, dict[str, str]] = {
    "keystroke_mean_hold_ms": {
        "human": "natural_keystroke_rhythm",
        "bot": "abnormal_keystroke_timing",
    },
    "keystroke_std_hold_ms": {
        "human": "natural_keystroke_variance",
        "bot": "uniform_keystroke_rhythm",
    },
    "keystroke_mean_interkey_ms": {"human": "natural_typing_speed", "bot": "abnormal_typing_speed"},
    "keystroke_std_interkey_ms": {
        "human": "natural_typing_rhythm",
        "bot": "uniform_keystroke_rhythm",
    },
    "typing_speed_chars_per_s": {"human": "natural_typing_speed", "bot": "machine_typing_speed"},
    "mouse_mean_speed_px_per_s": {"human": "natural_mouse_speed", "bot": "abnormal_mouse_speed"},
    "mouse_std_speed_px_per_s": {"human": "variable_mouse_speed", "bot": "constant_mouse_speed"},
    "mouse_path_efficiency": {"human": "nonlinear_mouse_path", "bot": "linear_mouse_path"},
    "mouse_idle_ratio": {"human": "natural_pauses", "bot": "no_pauses"},
    "mouse_direction_changes": {
        "human": "varied_mouse_direction",
        "bot": "straight_line_mouse_path",
    },
    "session_duration_ms": {"human": "natural_session_length", "bot": "abbreviated_session"},
    "event_count": {"human": "natural_event_volume", "bot": "sparse_event_volume"},
}


@dataclass
class ReasonCode:
    code: str
    weight: float


@dataclass
class ScoreResult:
    humanness_score: float
    label: str
    model_version: str
    reason_codes: list[ReasonCode]


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def label_for_score(score: float, human_threshold: float, bot_threshold: float) -> str:
    if score >= human_threshold:
        return "human"
    if score <= bot_threshold:
        return "bot"
    return "uncertain"


def top_reason_codes(contributions: dict[str, float]) -> list[ReasonCode]:
    """Top-3 features by |contribution|, mapped to human-readable codes."""
    ranked = sorted(contributions.items(), key=lambda kv: abs(kv[1]), reverse=True)[:3]
    codes: list[ReasonCode] = []
    for feature, contribution in ranked:
        direction = "human" if contribution >= 0 else "bot"
        codes.append(
            ReasonCode(code=LABEL_DICT[feature][direction], weight=round(abs(contribution), 4))
        )
    return codes


class Scorer(ABC):
    """Interface implemented by every scoring strategy."""

    @abstractmethod
    def score(self, features: dict[str, float]) -> ScoreResult: ...


class RuleBasedScorer(Scorer):
    """Deterministic weighted z-score sum against a hardcoded human baseline.

    Proves the pipeline end-to-end before any trained model exists. Each
    feature contributes weight * direction * z to the logit, squashed to [0,1]
    by a sigmoid. (ponytail: baseline only — replace with MLScorer once a
    model is trained; the baseline constants are heuristics, not learned.)
    """

    # (mean, std, direction, weight); direction +1 = higher is more human,
    # -1 = lower is more human. Means are centered on the SPEC §6.3 example
    # feature vector (a "typical human"), so an average session scores ~0.5.
    HUMAN_BASELINE: ClassVar[dict[str, tuple[float, float, int, float]]] = {
        "keystroke_mean_hold_ms": (90.0, 20.0, 1, 0.8),
        "keystroke_std_hold_ms": (15.0, 10.0, 1, 1.5),
        "keystroke_mean_interkey_ms": (110.0, 30.0, 1, 0.8),
        "keystroke_std_interkey_ms": (40.0, 20.0, 1, 1.5),
        "typing_speed_chars_per_s": (4.0, 2.0, -1, 0.5),
        "mouse_mean_speed_px_per_s": (300.0, 120.0, 1, 0.4),
        "mouse_std_speed_px_per_s": (90.0, 50.0, 1, 0.8),
        "mouse_path_efficiency": (0.82, 0.15, -1, 1.2),
        "mouse_idle_ratio": (0.35, 0.2, 1, 0.8),
        "mouse_direction_changes": (12.0, 8.0, 1, 1.0),
        "session_duration_ms": (5200.0, 3000.0, 1, 0.3),
        "event_count": (145.0, 100.0, 1, 0.3),
    }

    def __init__(
        self, human_threshold: float, bot_threshold: float, model_version: str = "rule-based"
    ) -> None:
        self.human_threshold = human_threshold
        self.bot_threshold = bot_threshold
        self.version = model_version
        self.model_version = model_version

    def _logit(self, features: dict[str, float]) -> tuple[float, dict[str, float]]:
        logit = 0.0
        contributions: dict[str, float] = {}
        for feature, (mean, std, direction, weight) in self.HUMAN_BASELINE.items():
            if feature not in features:
                continue
            z = (features[feature] - mean) / std if std else 0.0
            contribution = weight * direction * z
            contributions[feature] = contribution
            logit += contribution
        return logit, contributions

    def score(self, features: dict[str, float]) -> ScoreResult:
        logit, contributions = self._logit(features)
        humanness = sigmoid(logit)
        return ScoreResult(
            humanness_score=round(humanness, 4),
            label=label_for_score(humanness, self.human_threshold, self.bot_threshold),
            model_version=self.model_version,
            reason_codes=top_reason_codes(contributions),
        )


class MLScorer(Scorer):
    """Scorer backed by a trained model + metadata artifact (SPEC §9.1/§9.3)."""

    def __init__(
        self,
        model_path: str,
        metadata_path: str,
        human_threshold: float,
        bot_threshold: float,
        explainer_path: str | None = None,
    ) -> None:
        self.model = joblib.load(model_path)
        with open(metadata_path) as fh:
            meta = json.load(fh)
        self.version = meta["version"]
        self.feature_list = list(meta["feature_list"])
        self.means = {f: float(v) for f, v in meta["means"].items()}
        self.stds = {f: float(v) for f, v in meta["stds"].items()}
        self.human_threshold = human_threshold
        self.bot_threshold = bot_threshold

        if meta.get("model_type") == "logistic":
            self.coefficients = self.model.coef_[0]
        else:
            explainer = joblib.load(explainer_path or model_path)
            self.coefficients = explainer.coef_[0]

    def _z(self, features: dict[str, float]) -> list[float]:
        z: list[float] = []
        for f in self.feature_list:
            mean, std = self.means[f], self.stds[f]
            if std <= 1e-9:
                z.append(0.0)
            else:
                x = features.get(f, mean)
                z.append((x - mean) / std)
        return z

    def score(self, features: dict[str, float]) -> ScoreResult:
        z = self._z(features)
        humanness = float(self.model.predict_proba([z])[0][1])
        contributions = {
            f: float(c * zi) for f, c, zi in zip(self.feature_list, self.coefficients, z)
        }
        return ScoreResult(
            humanness_score=round(humanness, 4),
            label=label_for_score(humanness, self.human_threshold, self.bot_threshold),
            model_version=self.version,
            reason_codes=top_reason_codes(contributions),
        )


def load_scorer(
    model_dir: str,
    human_threshold: float,
    bot_threshold: float,
    shadow_version: str | None = None,
) -> tuple[Scorer, Scorer | None]:
    """Load the active scorer (and optional shadow scorer) from MODEL_DIR."""
    model_path = os.path.join(model_dir, "model.pkl")
    metadata_path = os.path.join(model_dir, "metadata.json")

    def _build(path: str, meta: str) -> MLScorer:
        with open(meta) as fh:
            model_type = json.load(fh).get("model_type")
        explainer = None
        if model_type == "random_forest":
            # "model.pkl" -> "explainer.pkl"; "model-v2.pkl" -> "explainer-v2.pkl"
            stem = os.path.basename(path)[: -len(".pkl")]
            explainer = os.path.join(os.path.dirname(path), stem.replace("model", "explainer", 1) + ".pkl")
        return MLScorer(path, meta, human_threshold, bot_threshold, explainer)

    active: Scorer
    if os.path.exists(model_path) and os.path.exists(metadata_path):
        active = _build(model_path, metadata_path)
    else:
        active = RuleBasedScorer(human_threshold, bot_threshold)

    shadow: Scorer | None = None
    if shadow_version:
        shadow_model = os.path.join(model_dir, f"model-{shadow_version}.pkl")
        shadow_meta = os.path.join(model_dir, f"metadata-{shadow_version}.json")
        if os.path.exists(shadow_model) and os.path.exists(shadow_meta):
            shadow = _build(shadow_model, shadow_meta)

    return active, shadow
