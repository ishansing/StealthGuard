"""Canonical feature formulas (SPEC §9.2 + Phase 9 A1/A5).

This is the single source of truth for how raw telemetry becomes the fixed
feature vector. The TypeScript SDK (Phase 4) must produce numerically matching
results — the cross-language parity tests enforce that.

Input shape follows SPEC §6.2 raw telemetry, extended by an optional
privacy-safe `signals` block (Phase 9 A5) carrying precomputed counts and the
input modality — no raw paste content, no new sensitive data:

    {
      "keystrokes":  [{"key": "a", "down_time": ..., "up_time": ...}, ...],
      "mouse_moves": [{"x": ..., "y": ..., "t": ...}, ...],
      "touch_moves": [{"x": ..., "y": ..., "t": ...}, ...],
      "clicks":      [{"x": ..., "y": ..., "t": ...}, ...],
      "signals":     {"paste_events": 0, "keyless_fills": 0, "input_modality": "mouse"}
    }

Times are epoch seconds; derived durations are milliseconds; speeds px/sec.
All outputs are finite floats; empty or malformed input yields zeros.
"""

import math
from collections import defaultdict
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

# Fitts's-law / arrival-to-click parameters (Phase 9 A1). Target geometry is
# not in the telemetry, so a nominal target width stands in for it (a typical
# click target); a production integration would supply real DOM geometry.
FITTS_W0 = 30.0  # assumed target width (px)
FITTS_ARRIVAL_R = FITTS_W0 / 2.0  # arrival radius = half the assumed width
FITTS_APPROACH_WINDOW = 8  # moves considered when locating the approach start
DIGRAPH_TOP_K = 5

# input_modality string -> numeric feature value.
MODALITY_MAP = {"mouse": 0, "keyboard": 1, "touch": 2, "switch": 3}

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
    "fitts_fit_error_ms",
    "arrival_to_click_latency_ms",
    "micro_tremor_px_per_s2",
    "digraph_mean_latency_ms",
    "digraph_std_latency_ms",
    "paste_event_count",
    "keyless_fill_count",
    "input_modality",
    "keystroke_share",
]


def _mean(values: list[float]) -> float:
    return fmean(values) if values else 0.0


def _std(values: list[float]) -> float:
    return pstdev(values) if len(values) > 1 else 0.0


def _sig_float(signals: Mapping[str, Any], key: str) -> float:
    value = signals.get(key, 0)
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


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


def _click_approaches(
    clicks: list[tuple[float, float, float]], all_moves: list[tuple[float, float, float]]
) -> tuple[list[float], list[tuple[float, float]]]:
    """Return (arrival latencies ms, [(ID, movement time ms)]) per click.

    For each click, the arrival run is the final stretch spent inside the
    assumed target radius; the approach start is the farthest recent point
    before it. Bots moving at constant speed do not follow the Fitts
    speed-accuracy tradeoff, so their movement-time vs ID fit is poor.
    """
    latencies: list[float] = []
    approaches: list[tuple[float, float]] = []
    for cx, cy, ct in clicks:
        prior = [(x, y, t) for x, y, t in all_moves if t < ct]
        if not prior:
            continue

        # Arrival: the start of the last run inside the assumed radius.
        arrival_t: float | None = None
        prev_inside = False
        for x, y, t in prior:
            inside = math.hypot(x - cx, y - cy) <= FITTS_ARRIVAL_R
            if inside and not prev_inside:
                arrival_t = t
            prev_inside = inside
        if arrival_t is None:
            continue
        latencies.append((ct - arrival_t) * 1000.0)

        # Approach start: farthest move in the window before the arrival run.
        window = [m for m in prior if m[2] <= arrival_t][-FITTS_APPROACH_WINDOW:]
        if not window:
            continue
        start = max(window, key=lambda m: math.hypot(m[0] - cx, m[1] - cy))
        dist = math.hypot(start[0] - cx, start[1] - cy)
        movement_ms = (ct - start[2]) * 1000.0
        fitts_id = math.log2(dist / FITTS_W0 + 1.0)
        approaches.append((fitts_id, movement_ms))
    return latencies, approaches


def _fitts_fit_error(approaches: list[tuple[float, float]]) -> float:
    """RMSE (ms) of the T = a + b·log2(D/W + 1) fit across clicks."""
    if len(approaches) < 2:
        return 0.0
    xs = [x for x, _ in approaches]
    ys = [y for _, y in approaches]
    mx = _mean(xs)
    denom = sum((x - mx) ** 2 for x in xs)
    if denom < 1e-9:
        return 0.0
    my = _mean(ys)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom
    a = my - b * mx
    return math.sqrt(_mean([(y - (a + b * x)) ** 2 for x, y in zip(xs, ys)]))


def _micro_tremor(all_moves: list[tuple[float, float, float]]) -> float:
    """Mean magnitude of the second finite difference of position (px/s^2).

    High-frequency (~8–12 Hz) jitter along the pointer path; a smooth
    constant-velocity path has near-zero tremor.
    """
    min_dt = MIN_DT_MS / 1000.0
    accels: list[float] = []
    for (x0, y0, t0), (x1, y1, t1), (x2, y2, t2) in zip(all_moves, all_moves[1:], all_moves[2:]):
        dt0 = t1 - t0
        dt1 = t2 - t1
        if dt0 < min_dt or dt1 < min_dt:
            continue
        ax = (x2 - 2 * x1 + x0) / (dt0 * dt1)
        ay = (y2 - 2 * y1 + y0) / (dt0 * dt1)
        accels.append(math.hypot(ax, ay))
    return _mean(accels)


def _digraph_timing(down_times: list[float], keys: list[dict[str, Any]]) -> tuple[float, float]:
    """Mean/std latency (ms) across the top-K most frequent key-pair digraphs."""
    pair_lat: defaultdict[tuple[str, str], list[float]] = defaultdict(list)
    for i in range(len(keys) - 1):
        key_i = keys[i].get("key")
        key_j = keys[i + 1].get("key")
        if key_i is None or key_j is None:
            continue
        pair_lat[(str(key_i), str(key_j))].append((down_times[i + 1] - down_times[i]) * 1000.0)
    top = sorted(pair_lat.items(), key=lambda kv: len(kv[1]), reverse=True)[:DIGRAPH_TOP_K]
    all_lats = [lat for _, lats in top for lat in lats]
    return _mean(all_lats), _std(all_lats)


def compute_features(telemetry: Mapping[str, Any]) -> dict[str, float]:
    """Compute the fixed feature vector from a raw telemetry payload (§6.2)."""
    keys = telemetry.get("keystrokes") or []
    moves = telemetry.get("mouse_moves") or []
    touches = telemetry.get("touch_moves") or []
    clicks = telemetry.get("clicks") or []
    signals = telemetry.get("signals") or {}

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

    interkeys = [(b - a) * 1000.0 for a, b in pairwise(down_times)]

    all_moves: list[tuple[float, float, float]] = []
    for m in list(moves) + list(touches):
        x, y, t = m.get("x"), m.get("y"), m.get("t")
        if x is not None and y is not None and t is not None:
            all_moves.append((float(x), float(y), float(t)))
            timestamps.append(float(t))

    click_points: list[tuple[float, float, float]] = []
    for c in clicks:
        t = c.get("t")
        if t is not None:
            timestamps.append(float(t))
            click_points.append((float(c.get("x", 0.0)), float(c.get("y", 0.0)), float(t)))

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

    latencies, approaches = _click_approaches(click_points, all_moves)
    digraph_mean, digraph_std = _digraph_timing(down_times, list(keys))

    modality = str(signals.get("input_modality", "mouse")).lower()
    input_modality = float(MODALITY_MAP.get(modality, 0))
    paste_events = _sig_float(signals, "paste_events")
    keyless_fills = _sig_float(signals, "keyless_fills")
    total_events = float(len(keys) + len(all_moves) + len(click_points))
    keystroke_share = len(keys) / total_events if total_events > 0 else 0.0

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
        "event_count": total_events,
        "fitts_fit_error_ms": _fitts_fit_error(approaches),
        "arrival_to_click_latency_ms": _mean(latencies),
        "micro_tremor_px_per_s2": _micro_tremor(all_moves),
        "digraph_mean_latency_ms": digraph_mean,
        "digraph_std_latency_ms": digraph_std,
        "paste_event_count": paste_events,
        "keyless_fill_count": keyless_fills,
        "input_modality": input_modality,
        "keystroke_share": keystroke_share,
    }
