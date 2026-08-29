"""Phase 9 A5 — accessibility personas must never resolve to `block`.

Hard-fail: any accessibility persona (screen-reader keyboard-only, switch
device, tremor-affected mouse) that scores `bot` is a regression. The
per-modality threshold profiles (ADR-0011) are what keep these flows
reachable, so the scorer is exercised with those profiles here.
"""

import pytest

from app.accessibility import ACCESSIBILITY_PERSONAS, MODALITY_THRESHOLDS
from app.features import compute_features
from app.scorer import RuleBasedScorer


@pytest.mark.parametrize("name", list(ACCESSIBILITY_PERSONAS))
def test_accessibility_persona_never_resolves_to_block(name: str) -> None:
    scorer = RuleBasedScorer(0.8, 0.4, modality_thresholds=MODALITY_THRESHOLDS)
    features = compute_features(ACCESSIBILITY_PERSONAS[name])
    result = scorer.score(features)
    assert (
        result.label != "bot"
    ), f"{name} resolved to {result.label} (score {result.humanness_score})"
