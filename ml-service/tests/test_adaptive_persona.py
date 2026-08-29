"""Phase 9 A4 — the adaptive red-team persona stays distinguishable from humans.

Guards against accidentally training the model to reject real humans: the
adaptive persona deliberately undercuts the decision boundary (jitter, pauses,
non-uniform digraph timing) but its keystroke timing variance must remain
clearly BELOW real human variance and clearly ABOVE the naive bot's.
"""

import numpy as np

from app.accessibility import screen_reader_telemetry
from app.features import compute_features

TEXT = "alicespring2026"
ADAPTIVE_JITTER = 0.6
PAUSE_RATE = 0.2


def _adaptive_telemetry(rng: np.random.Generator) -> dict:
    keys = []
    t = 0.0
    for i, key in enumerate(TEXT):
        hold = max(0.04, 0.07 + (rng.random() - 0.5) * ADAPTIVE_JITTER * 0.08)
        inter = max(0.03, 0.09 + (rng.random() - 0.5) * ADAPTIVE_JITTER * 0.1)
        if rng.random() < PAUSE_RATE:
            inter += 0.3
        keys.append({"key": key, "down_time": t, "up_time": round(t + hold, 3)})
        t += hold + inter
    moves = []
    mt = 0.0
    x, y = 60.0, 60.0
    for i in range(8):
        mt += 0.09 + rng.random() * 0.12
        x = min(520, max(20, x + 20 + (rng.random() - 0.5) * ADAPTIVE_JITTER * 30))
        y = min(420, max(20, y + 14 + (rng.random() - 0.5) * ADAPTIVE_JITTER * 24))
        moves.append({"x": round(x, 3), "y": round(y, 3), "t": round(mt, 3)})
    return {
        "keystrokes": keys,
        "mouse_moves": moves,
        "touch_moves": [],
        "clicks": [{"x": 300, "y": 400, "t": round(mt + 0.15, 3)}],
    }


def _human_telemetry() -> dict:
    return screen_reader_telemetry() | {
        "mouse_moves": [
            {"x": 100, "y": 100, "t": 0.0},
            {"x": 140, "y": 180, "t": 0.7},
            {"x": 120, "y": 220, "t": 1.4},
            {"x": 200, "y": 250, "t": 2.1},
            {"x": 260, "y": 230, "t": 2.8},
            {"x": 280, "y": 300, "t": 3.5},
        ]
    }


def test_adaptive_persona_interkey_variance_is_below_human_and_above_bot() -> None:
    rng = np.random.default_rng(7)
    adaptive = compute_features(_adaptive_telemetry(rng))
    human = compute_features(_human_telemetry())

    assert 0.0 < adaptive["keystroke_std_interkey_ms"], "adaptive must not be perfectly uniform"
    assert adaptive["keystroke_std_interkey_ms"] < human["keystroke_std_interkey_ms"], (
        "adaptive must stay distinguishable from real human variance "
        "(otherwise training on it could reject real humans)"
    )
    assert adaptive["digraph_std_latency_ms"] < human["digraph_std_latency_ms"]
