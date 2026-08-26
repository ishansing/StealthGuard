"""Canonical feature formulas (SPEC §9.2).

This is the single source of truth for how raw telemetry becomes the fixed
feature vector. The TypeScript SDK (Phase 4) must produce numerically matching
results — the cross-language parity tests enforce that.

Input shape follows SPEC §6.2 raw telemetry:

    {
      "keystrokes":  [{"key": "a", "down_time": ..., "up_time": ...}, ...],
      "mouse_moves": [{"x": ..., "y": ..., "t": ...}, ...],
      "touch_moves": [{"x": ..., "y": ..., "t": ...}, ...],
      "clicks":      [{"x": ..., "y": ..., "t": ...}, ...]
    }

Times are epoch seconds; derived durations are milliseconds; speeds px/sec.
All outputs are finite floats; empty or malformed input yields zeros.
"""

import math
from collections.abc import Mapping
from itertools import pairwise
from statistics import fmean, pstdev
from typing import Any

# A gap between consecutive mouse samples longer than this counts as idle.
IDLE_THRESHOLD_MS = 1000.0
# Direction change = consecutive movement segments diverging by more than this.
DIRECTION_CHANGE_THRESHOLD_RAD = math.radians(45.0)
# Segments closer than this (1 ms) carry no meaningful velocity — real
# telemetry has ms precision; tiny deltas otherwise overflow to inf.
MIN_DT_MS = 1.0
MIN_DURATION_MS = 1e-6
# A path shorter than this (px) carries no shape — efficiency is undefined.
MIN_DIST = 1e-9

FEATURE_NAMES: list[str] = [
    "keystroke_mean_hold_ms",
    "keystroke_std_hold_ms",
    "keystroke_mean_interkey_ms",
    "keystroke_std_interkey_ms",
    "typing_speed_chars_per_s",
    "mouse_mean_speed_px_per_s",
    "mouse_std_speed_px_per_s",
    "mouse_path_efficiency",
    "mouse_idle_ratio",
    "mouse_direction_changes",
    "session_duration_ms",
    "event_count",
]


def _mean(values: list[float]) -> float:
    return fmean(values) if values else 0.0


def _std(values: list[float]) -> float:
    return pstdev(values) if len(values) > 1 else 0.0


def _direction_changes(points: list[tuple[float, float]]) -> int:
    """Count consecutive movement segments whose angle diverges > 45 deg."""
    segs: list[tuple[float, float]] = []
    for (x0, y0), (x1, y1) in pairwise(points):
        dx, dy = x1 - x0, y1 - y0
        if dx == 0 and dy == 0:
            continue
        segs.append((dx, dy))
    changes = 0
    for (ax, ay), (bx, by) in pairwise(segs):
        dot = ax * bx + ay * by
        cross = abs(ax * by - ay * bx)
        if math.atan2(cross, dot) > DIRECTION_CHANGE_THRESHOLD_RAD:
            changes += 1
    return changes


def compute_features(telemetry: Mapping[str, Any]) -> dict[str, float]:
    """Compute the fixed feature vector from a raw telemetry payload (§6.2)."""
    keys = telemetry.get("keystrokes") or []
    moves = telemetry.get("mouse_moves") or []
    touches = telemetry.get("touch_moves") or []
    clicks = telemetry.get("clicks") or []

    timestamps: list[float] = []
    holds: list[float] = []
    down_times: list[float] = []

    for k in keys:
        down = k.get("down_time")
        up = k.get("up_time")
        if down is not None:
            timestamps.append(float(down))
            down_times.append(float(down))
        if up is not None:
            timestamps.append(float(up))
        if down is not None and up is not None:
            holds.append((float(up) - float(down)) * 1000.0)

    interkeys = [b - a for a, b in pairwise(down_times)]

    all_moves: list[tuple[float, float, float]] = []
    for m in list(moves) + list(touches):
        x, y, t = m.get("x"), m.get("y"), m.get("t")
        if x is not None and y is not None and t is not None:
            all_moves.append((float(x), float(y), float(t)))
            timestamps.append(float(t))

    for c in clicks:
        t = c.get("t")
        if t is not None:
            timestamps.append(float(t))

    duration_ms = 0.0
    if timestamps:
        duration_ms = max(0.0, (max(timestamps) - min(timestamps)) * 1000.0)
    if duration_ms < MIN_DURATION_MS:
        duration_ms = 0.0
    duration_s = duration_ms / 1000.0

    speeds: list[float] = []
    seg_dists: list[float] = []
    seg_times: list[float] = []
    for (x0, y0, t0), (x1, y1, t1) in pairwise(all_moves):
        dist = math.hypot(x1 - x0, y1 - y0)
        dt_ms = (float(t1) - float(t0)) * 1000.0
        if dist > 0 and dt_ms >= MIN_DT_MS:
            speeds.append(dist / (dt_ms / 1000.0))
            seg_dists.append(dist)
            seg_times.append(dt_ms)

    total_dist = sum(seg_dists)
    straight = 0.0
    if len(all_moves) >= 2:
        straight = math.hypot(
            all_moves[-1][0] - all_moves[0][0],
            all_moves[-1][1] - all_moves[0][1],
        )
    path_efficiency = straight / total_dist if total_dist >= MIN_DIST else 0.0

    active_ms = sum(min(dt, IDLE_THRESHOLD_MS) for dt in seg_times)
    idle_ratio = 1.0 - active_ms / duration_ms if duration_ms > 0 else 0.0

    typing_speed = len(keys) / duration_s if duration_s > 0 else 0.0

    return {
        "keystroke_mean_hold_ms": _mean(holds),
        "keystroke_std_hold_ms": _std(holds),
        "keystroke_mean_interkey_ms": _mean(interkeys),
        "keystroke_std_interkey_ms": _std(interkeys),
        "typing_speed_chars_per_s": typing_speed,
        "mouse_mean_speed_px_per_s": _mean(speeds),
        "mouse_std_speed_px_per_s": _std(speeds),
        "mouse_path_efficiency": path_efficiency,
        "mouse_idle_ratio": idle_ratio,
        "mouse_direction_changes": float(_direction_changes([(x, y) for x, y, _ in all_moves])),
        "session_duration_ms": duration_ms,
        "event_count": float(len(keys) + len(all_moves) + len(clicks)),
    }
