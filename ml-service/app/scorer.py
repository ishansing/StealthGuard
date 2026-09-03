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
import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

from app.sequence import telemetry_to_sequence

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
    "fitts_fit_error_ms": {"human": "fitts_conformant_movement", "bot": "non_conformant_movement"},
    "arrival_to_click_latency_ms": {"human": "natural_click_pause", "bot": "instant_click"},
    "micro_tremor_px_per_s2": {"human": "natural_micro_tremor", "bot": "no_micro_tremor"},
    "digraph_mean_latency_ms": {
        "human": "natural_digraph_timing",
        "bot": "abnormal_digraph_timing",
    },
    "digraph_std_latency_ms": {"human": "natural_typing_rhythm", "bot": "uniform_keystroke_rhythm"},
    "paste_event_count": {"human": "natural_input_behavior", "bot": "no_paste"},
    "keyless_fill_count": {"human": "natural_input_behavior", "bot": "keyless_fill"},
    "input_modality": {"human": "natural_input_modality", "bot": "unexpected_modality"},
    "keystroke_share": {"human": "natural_input_mix", "bot": "unusual_input_mix"},
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


# Clamp standardized feature values to this many standard deviations before
# weighting. Anchored on live telemetry: a single outlier feature (e.g.
# micro-tremor on a buffer that holds only mouse jitter) used to drive the
# logit unboundedly and pin a near-empty session to a confident "human" 1.0.
# Genuine human sessions stay within ~±3σ (verified unchanged); only
# outlier-dominated buffers are pulled away from extreme scores.
Z_CLIP = 3.0

# Small-sample keyboard prior (rule-based baseline only). The baseline assumes
# plentiful keyboard AND mouse telemetry, so a short-but-real typing burst
# (e.g. a 1–2 key test) scores ~0 because absent-mouse and low keystroke
# variance are treated as bot evidence. Pull such sessions toward the neutral
# 0.5, but only when there is genuine keyboard input, and taper the pull as the
# input grows (so a real bot with many keystrokes is still flagged low, and a
# mouse-only / jitter buffer with zero keystrokes is left untouched).
KEYBOARD_PRIOR = 4.0
KEYBOARD_DECAY = 2.0


def label_for_score(score: float, human_threshold: float, bot_threshold: float) -> str:
    if score >= human_threshold:
        return "human"
    if score <= bot_threshold:
        return "bot"
    return "uncertain"


MODALITY_NAMES = {0: "mouse", 1: "keyboard", 2: "touch", 3: "switch"}


class Calibrator:
    """Probability calibrator over a base model's raw output (Phase 9 A2).

    Platt scaling (sigmoid) fits a logistic regression on the base
    probability; isotonic fits an isotonic regression. `calibrate` maps a base
    probability to a calibrated one so `humanness_score = 0.8` means a stable
    ~80% confidence across retrains (ADR-0008).
    """

    def __init__(self, method: str, model) -> None:
        self.method = method
        self.model = model

    @classmethod
    def fit(cls, method: str, base_proba: np.ndarray, y: np.ndarray) -> "Calibrator":
        if method == "sigmoid":
            model = LogisticRegression().fit(base_proba.reshape(-1, 1), y)
        else:
            model = IsotonicRegression(out_of_bounds="clip").fit(base_proba, y)
        return cls(method, model)

    def calibrate(self, base_proba: float) -> float:
        if self.method == "sigmoid":
            return float(self.model.predict_proba([[base_proba]])[0][1])
        return float(self.model.predict([base_proba])[0])

    def calibrate_array(self, base_proba: np.ndarray) -> np.ndarray:
        if self.method == "sigmoid":
            return self.model.predict_proba(base_proba.reshape(-1, 1))[:, 1]
        return self.model.predict(base_proba)


def thresholds_for_features(
    features: dict[str, float],
    default: tuple[float, float],
    per_modality: dict[str, tuple[float, float]],
) -> tuple[float, float]:
    """Pick (human, bot) label thresholds by the features' input_modality."""
    modality = MODALITY_NAMES.get(int(features.get("input_modality", 0)), "mouse")
    return per_modality.get(modality, default)


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
        # Phase 9 A1: richer features.
        "fitts_fit_error_ms": (50.0, 40.0, -1, 0.5),
        "arrival_to_click_latency_ms": (200.0, 150.0, 1, 0.3),
        "micro_tremor_px_per_s2": (150.0, 120.0, 1, 0.6),
        "digraph_mean_latency_ms": (150.0, 50.0, 1, 0.3),
        "digraph_std_latency_ms": (25.0, 18.0, 1, 0.8),
        "paste_event_count": (0.2, 0.4, 1, 0.2),
        "keyless_fill_count": (0.1, 0.3, 1, 0.2),
        # Phase 9 A5: modality context is neutral in the baseline — the
        # per-modality threshold profiles handle accessibility, not the score.
        "input_modality": (0.0, 1.0, 1, 0.0),
        "keystroke_share": (0.5, 0.3, 1, 0.0),
    }

    def __init__(
        self,
        human_threshold: float,
        bot_threshold: float,
        model_version: str = "rule-based",
        modality_thresholds: dict[str, tuple[float, float]] | None = None,
    ) -> None:
        self.human_threshold = human_threshold
        self.bot_threshold = bot_threshold
        self.modality_thresholds = modality_thresholds or {}
        self.version = model_version
        self.model_version = model_version

    def _prior_dampening(self, features: dict[str, float]) -> float:
        """Uniform dampening factor from the small-sample keyboard prior.

        Returns a multiplier in [0, 1] applied to every feature contribution. A
        short-but-real typing burst yields a high dampening (the score is pulled
        toward the neutral 0.5), while a full session or a mouse-only buffer gets
        ~1.0 (unchanged). Applying it to each contribution keeps the logit, label,
        and reason codes mutually consistent — they all derive from the same
        dampened values — so the returned explanation always matches the score.
        """
        if KEYBOARD_PRIOR <= 0.0:
            return 1.0
        keyboard_count = features.get("event_count", 0.0) * features.get("keystroke_share", 0.0)
        if keyboard_count <= 0.0:
            return 1.0
        shrink = min(1.0, KEYBOARD_PRIOR * math.exp(-keyboard_count / KEYBOARD_DECAY))
        return 1.0 - shrink

    def _logit(self, features: dict[str, float]) -> tuple[float, dict[str, float]]:
        dampening = self._prior_dampening(features)
        logit = 0.0
        contributions: dict[str, float] = {}
        for feature, (mean, std, direction, weight) in self.HUMAN_BASELINE.items():
            if feature not in features:
                continue
            z = (features[feature] - mean) / std if std else 0.0
            if z < -Z_CLIP:
                z = -Z_CLIP
            elif z > Z_CLIP:
                z = Z_CLIP
            contribution = weight * direction * z * dampening
            contributions[feature] = contribution
            logit += contribution
        return logit, contributions

    def score(self, features: dict[str, float]) -> ScoreResult:
        logit, contributions = self._logit(features)
        humanness = sigmoid(logit)
        human_t, bot_t = thresholds_for_features(
            features, (self.human_threshold, self.bot_threshold), self.modality_thresholds
        )
        return ScoreResult(
            humanness_score=round(humanness, 4),
            label=label_for_score(humanness, human_t, bot_t),
            model_version=self.model_version,
            reason_codes=top_reason_codes(contributions),
        )


class MLScorer(Scorer):
    """Scorer backed by a trained model + metadata artifact (SPEC §9.1/§9.3).

    Uses the calibrated model (Phase 9 A2) for `humanness_score` when a
    `calibrated.pkl` artifact exists; coefficients still come from the base
    model for explainability.
    """

    def __init__(
        self,
        model_path: str,
        metadata_path: str,
        human_threshold: float,
        bot_threshold: float,
        explainer_path: str | None = None,
        modality_thresholds: dict[str, tuple[float, float]] | None = None,
        calibrated_path: str | None = None,
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
        self.modality_thresholds = modality_thresholds or {}
        self.calibrated = (
            joblib.load(calibrated_path)
            if calibrated_path and os.path.exists(calibrated_path)
            else None
        )

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
                z.append(max(-Z_CLIP, min(Z_CLIP, (x - mean) / std)))
        return z

    def score(self, features: dict[str, float]) -> ScoreResult:
        z = self._z(features)
        base_proba = float(self.model.predict_proba([z])[0][1])
        if self.calibrated is not None:
            humanness = self.calibrated.calibrate(base_proba)
        else:
            humanness = base_proba
        contributions = {
            f: float(c * zi) for f, c, zi in zip(self.feature_list, self.coefficients, z)
        }
        human_t, bot_t = thresholds_for_features(
            features, (self.human_threshold, self.bot_threshold), self.modality_thresholds
        )
        return ScoreResult(
            humanness_score=round(humanness, 4),
            label=label_for_score(humanness, human_t, bot_t),
            model_version=self.version,
            reason_codes=top_reason_codes(contributions),
        )


class SequenceShadowScorer:
    """Lightweight sequence-model shadow candidate (Phase 9 A3).

    Scores the raw event stream (not the feature vector) and is only ever
    logged — never a decision — until evaluated against real traffic
    (ADR-0009).
    """

    def __init__(self, model_path: str, metadata_path: str) -> None:
        self.model = joblib.load(model_path)
        with open(metadata_path) as fh:
            meta = json.load(fh)
        self.version = meta["version"]

    def score(self, telemetry) -> float:
        seq = telemetry_to_sequence(telemetry)
        return float(self.model.predict_proba([seq])[0][1])


def load_sequence_shadow(model_dir: str) -> SequenceShadowScorer | None:
    model_path = os.path.join(model_dir, "model-v2-seq.pkl")
    meta_path = os.path.join(model_dir, "metadata-v2-seq.json")
    if os.path.exists(model_path) and os.path.exists(meta_path):
        return SequenceShadowScorer(model_path, meta_path)
    return None


def load_scorer(
    model_dir: str,
    human_threshold: float,
    bot_threshold: float,
    shadow_version: str | None = None,
    modality_thresholds: dict[str, tuple[float, float]] | None = None,
) -> tuple[Scorer, Scorer | None]:
    """Load the active scorer (and optional shadow scorer) from MODEL_DIR."""
    model_path = os.path.join(model_dir, "model.pkl")
    metadata_path = os.path.join(model_dir, "metadata.json")

    def _build(path: str, meta: str) -> MLScorer:
        with open(meta) as fh:
            model_type = json.load(fh).get("model_type")
        explainer = None
        calibrated = None
        stem = os.path.basename(path)[: -len(".pkl")]
        model_dir = os.path.dirname(path)
        if model_type == "random_forest":
            # "model.pkl" -> "explainer.pkl"; "model-v2.pkl" -> "explainer-v2.pkl"
            explainer = os.path.join(model_dir, stem.replace("model", "explainer", 1) + ".pkl")
        calibrated = os.path.join(model_dir, stem.replace("model", "calibrated", 1) + ".pkl")
        return MLScorer(
            path, meta, human_threshold, bot_threshold, explainer, modality_thresholds, calibrated
        )

    active: Scorer
    if os.path.exists(model_path) and os.path.exists(metadata_path):
        active = _build(model_path, metadata_path)
    else:
        active = RuleBasedScorer(
            human_threshold, bot_threshold, modality_thresholds=modality_thresholds
        )

    shadow: Scorer | None = None
    if shadow_version:
        shadow_model = os.path.join(model_dir, f"model-{shadow_version}.pkl")
        shadow_meta = os.path.join(model_dir, f"metadata-{shadow_version}.json")
        if os.path.exists(shadow_model) and os.path.exists(shadow_meta):
            shadow = _build(shadow_model, shadow_meta)

    return active, shadow
