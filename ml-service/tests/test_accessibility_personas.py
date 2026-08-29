"""Phase 9 A5 — accessibility personas must never resolve to `block`.

Hard-fail: any accessibility persona (screen-reader keyboard-only, switch
device, tremor-affected mouse) that scores `bot` is a regression. The
per-modality threshold profiles (ADR-0011) are what keep these flows
reachable, so the scorer is exercised with those profiles here.
"""

import pytest

from app.features import compute_features
from app.scorer import RuleBasedScorer

# Must mirror the gateway's per-modality profiles (application.yml).
MODALITY_THRESHOLDS = {
    "keyboard": (0.6, 0.2),
    "touch": (0.7, 0.3),
    "switch": (0.5, 0.0),
}

TEXT = "alicespring2026"


def _screen_reader() -> dict:
    keys = []
    t = 0
    for i, key in enumerate(TEXT):
        hold = (80 + (i % 3) * 60) / 1000
        keys.append({"key": key, "down_time": t, "up_time": round(t + hold, 3)})
        t += hold + (300 + (i % 4) * 120) / 1000
    return {
        "keystrokes": keys,
        "mouse_moves": [],
        "touch_moves": [],
        "clicks": [],
        "signals": {"paste_events": 0, "keyless_fills": 0, "input_modality": "keyboard"},
    }


def _switch() -> dict:
    moves = []
    clicks = []
    t = 0
    for i in range(3):
        target = (120 + i * 100, 140 + i * 40)
        for step in range(3):
            t += 0.8 + step * 0.3
            moves.append(
                {
                    "x": round(target[0] * (step + 1) / 3, 1),
                    "y": round(target[1] * (step + 1) / 3, 1),
                    "t": round(t, 3),
                }
            )
        t += 0.5  # dwell before selection
        clicks.append({"x": target[0], "y": target[1], "t": round(t, 3)})
    return {
        "keystrokes": [],
        "mouse_moves": moves,
        "touch_moves": [],
        "clicks": clicks,
        "signals": {"paste_events": 0, "keyless_fills": 0, "input_modality": "switch"},
    }


def _tremor() -> dict:
    keys = []
    t = 0
    for i, key in enumerate(TEXT):
        hold = (70 + (i % 4) * 40) / 1000
        keys.append({"key": key, "down_time": t, "up_time": round(t + hold, 3)})
        t += hold + (100 + (i % 3) * 80) / 1000
    moves = []
    mt = 0
    x, y = 60, 60
    for i in range(14):
        mt += 0.12 + (i % 3) * 0.06
        x = min(520, max(20, x + (i % 5) * 15 - 15))
        y = min(420, max(20, y + (i % 4) * 12 - 10))
        tremor = (i % 2) * 3 - 1.5
        moves.append({"x": round(x + tremor, 3), "y": round(y + tremor, 3), "t": round(mt, 3)})
    return {
        "keystrokes": keys,
        "mouse_moves": moves,
        "touch_moves": [],
        "clicks": [{"x": 300, "y": 400, "t": round(mt + 0.2, 3)}],
        "signals": {"paste_events": 0, "keyless_fills": 0, "input_modality": "mouse"},
    }


PERSONAS = {
    "screen-reader": _screen_reader,
    "switch": _switch,
    "tremor": _tremor,
}


@pytest.mark.parametrize("name", list(PERSONAS))
def test_accessibility_persona_never_resolves_to_block(name: str) -> None:
    scorer = RuleBasedScorer(0.8, 0.4, modality_thresholds=MODALITY_THRESHOLDS)
    features = compute_features(PERSONAS[name]())
    result = scorer.score(features)
    assert (
        result.label != "bot"
    ), f"{name} resolved to {result.label} (score {result.humanness_score})"
