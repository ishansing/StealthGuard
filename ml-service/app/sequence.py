"""Lightweight sequence encoding over the raw event stream (Phase 9 A3).

Each session's raw telemetry is encoded into a fixed-length sequence of
per-event vectors (one-hot event type + normalized position + time delta +
hold), flattened for a small MLP. This is a lightweight neural net over the
raw stream — the documented sequence-model shadow candidate (ADR-0009). A
production CNN/RNN (torch) is future work; the encoding contract is stable.
"""

from collections.abc import Mapping
from typing import Any

import numpy as np

MAX_SEQ = 64
FEATURE_DIM = 8  # 4 one-hot + x + y + dt + hold

_EVENT_ONEHOT: dict[str, list[float]] = {
    "keystroke": [1.0, 0.0, 0.0, 0.0],
    "mouse_move": [0.0, 1.0, 0.0, 0.0],
    "touch_move": [0.0, 0.0, 1.0, 0.0],
    "click": [0.0, 0.0, 0.0, 1.0],
}


def telemetry_to_sequence(telemetry: Mapping[str, Any]) -> np.ndarray:
    raw: list[tuple[float, list[float], float, float, float]] = []
    for k in telemetry.get("keystrokes") or []:
        down = k.get("down_time")
        up = k.get("up_time")
        t = float(down) if down is not None else 0.0
        hold = (
            (float(up) - float(down)) * 1000.0 / 500.0
            if down is not None and up is not None
            else 0.0
        )
        raw.append((t, _EVENT_ONEHOT["keystroke"], 0.0, 0.0, hold))
    for m in telemetry.get("mouse_moves") or []:
        if m.get("t") is not None:
            raw.append(
                (float(m["t"]), _EVENT_ONEHOT["mouse_move"], _px(m.get("x")), _px(m.get("y")), 0.0)
            )
    for m in telemetry.get("touch_moves") or []:
        if m.get("t") is not None:
            raw.append(
                (float(m["t"]), _EVENT_ONEHOT["touch_move"], _px(m.get("x")), _px(m.get("y")), 0.0)
            )
    for c in telemetry.get("clicks") or []:
        if c.get("t") is not None:
            raw.append(
                (float(c["t"]), _EVENT_ONEHOT["click"], _px(c.get("x")), _px(c.get("y")), 0.0)
            )
    raw.sort(key=lambda e: e[0])

    seq: list[list[float]] = []
    prev: float | None = None
    for t, onehot, x, y, hold in raw:
        dt = 0.0 if prev is None else t - prev
        prev = t
        seq.append(onehot + [x, y, dt, hold])
    if len(seq) > MAX_SEQ:
        seq = seq[:MAX_SEQ]
    while len(seq) < MAX_SEQ:
        seq.append([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
    return np.array(seq, dtype=float).flatten()


def _px(v: Any) -> float:
    try:
        return float(v) / 1000.0
    except (TypeError, ValueError):
        return 0.0
