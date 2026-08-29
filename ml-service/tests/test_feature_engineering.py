import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.features import FEATURE_NAMES, compute_features

point = st.fixed_dictionaries(
    {
        "x": st.floats(allow_nan=False, allow_infinity=False, min_value=-1e4, max_value=1e4),
        "y": st.floats(allow_nan=False, allow_infinity=False, min_value=-1e4, max_value=1e4),
        "t": st.floats(allow_nan=False, allow_infinity=False, min_value=0.0, max_value=1e12),
    }
)

keystroke = st.fixed_dictionaries(
    {
        "key": st.one_of(st.none(), st.text(max_size=4)),
        "down_time": st.floats(
            allow_nan=False, allow_infinity=False, min_value=0.0, max_value=1e12
        ),
        "up_time": st.one_of(
            st.none(),
            st.floats(allow_nan=False, allow_infinity=False, min_value=0.0, max_value=1e12),
        ),
    }
)

signals = st.one_of(
    st.none(),
    st.fixed_dictionaries(
        {
            "paste_events": st.integers(min_value=0, max_value=100),
            "keyless_fills": st.integers(min_value=0, max_value=100),
            "input_modality": st.sampled_from(["mouse", "keyboard", "touch", "switch"]),
        }
    ),
)

telemetry = st.fixed_dictionaries(
    {
        "keystrokes": st.lists(keystroke, max_size=300),
        "mouse_moves": st.lists(point, max_size=300),
        "touch_moves": st.lists(point, max_size=300),
        "clicks": st.lists(point, max_size=300),
        "signals": signals,
    }
)


@settings(max_examples=100, deadline=None)
@given(telemetry)
def test_features_always_finite_and_complete(t) -> None:
    features = compute_features(t)
    assert set(features) == set(FEATURE_NAMES)
    for value in features.values():
        assert math.isfinite(value), value


def test_empty_telemetry_is_all_zero() -> None:
    features = compute_features({})
    assert set(features) == set(FEATURE_NAMES)
    assert all(value == 0.0 for value in features.values())


def test_malformed_events_never_crash() -> None:
    malformed = {
        "keystrokes": [{"key": "a"}, {"down_time": 1.0}, {}],
        "mouse_moves": [{"x": 1}, {"y": 2, "t": 3.0}, {}],
        "touch_moves": [{"t": 5.0}],
        "clicks": [{"x": 1, "y": 2}, {"t": 4.0}],
        "signals": {"paste_events": "nope", "input_modality": 42},
    }
    features = compute_features(malformed)
    assert all(math.isfinite(value) for value in features.values())


def test_signals_flow_into_features() -> None:
    features = compute_features(
        {
            "keystrokes": [{"key": "a", "down_time": 0.0, "up_time": 0.1}],
            "mouse_moves": [],
            "touch_moves": [],
            "clicks": [],
            "signals": {"paste_events": 3, "keyless_fills": 2, "input_modality": "keyboard"},
        }
    )
    assert features["paste_event_count"] == 3.0
    assert features["keyless_fill_count"] == 2.0
    assert features["input_modality"] == 1.0
    assert features["keystroke_share"] == 1.0


def test_fitts_and_tremor_distinguish_bot_from_human() -> None:
    """A constant-speed straight-line bot fits Fitts's law poorly (residual > 0)
    and has near-zero tremor; a natural curved path has measurable tremor and
    sparse clicks (fit trivially exact)."""
    bot = compute_features(
        {
            "mouse_moves": [{"x": 10 * i, "y": 10 * i, "t": 0.05 * i} for i in range(9)],
            "clicks": [
                {"x": 20, "y": 20, "t": 0.12},
                {"x": 50, "y": 50, "t": 0.27},
                {"x": 80, "y": 80, "t": 0.42},
            ],
            "keystrokes": [],
            "touch_moves": [],
        }
    )
    human = compute_features(
        {
            "mouse_moves": [
                {"x": 100, "y": 100, "t": 0.0},
                {"x": 115, "y": 95, "t": 0.15},
                {"x": 105, "y": 115, "t": 0.30},
                {"x": 125, "y": 110, "t": 0.45},
                {"x": 135, "y": 120, "t": 0.55},
            ],
            "clicks": [{"x": 135, "y": 120, "t": 0.6}],
            "keystrokes": [],
            "touch_moves": [],
        }
    )
    assert bot["micro_tremor_px_per_s2"] < human["micro_tremor_px_per_s2"]
    assert bot["fitts_fit_error_ms"] > human["fitts_fit_error_ms"]
    assert bot["fitts_fit_error_ms"] > 0


def test_human_like_telemetry_differs_from_bot_like() -> None:
    human = compute_features(
        {
            "keystrokes": [
                {"key": "a", "down_time": 0.0, "up_time": 0.09},
                {"key": "b", "down_time": 0.25, "up_time": 0.36},
                {"key": "c", "down_time": 0.55, "up_time": 0.63},
                {"key": "d", "down_time": 0.9, "up_time": 1.02},
            ],
            "mouse_moves": [
                {"x": 100, "y": 100, "t": 0.0},
                {"x": 120, "y": 130, "t": 0.2},
                {"x": 150, "y": 120, "t": 0.5},
                {"x": 160, "y": 160, "t": 0.9},
            ],
        }
    )
    bot = compute_features(
        {
            "keystrokes": [
                {"key": "a", "down_time": 0.0, "up_time": 0.08},
                {"key": "b", "down_time": 0.08, "up_time": 0.16},
                {"key": "c", "down_time": 0.16, "up_time": 0.24},
                {"key": "d", "down_time": 0.24, "up_time": 0.32},
            ],
            "mouse_moves": [
                {"x": 100, "y": 100, "t": 0.0},
                {"x": 120, "y": 120, "t": 0.2},
                {"x": 140, "y": 140, "t": 0.4},
                {"x": 160, "y": 160, "t": 0.6},
            ],
        }
    )
    assert human["keystroke_std_hold_ms"] > bot["keystroke_std_hold_ms"]
    assert human["keystroke_std_interkey_ms"] > bot["keystroke_std_interkey_ms"]
    assert human["mouse_direction_changes"] > bot["mouse_direction_changes"]
    assert human["mouse_path_efficiency"] < bot["mouse_path_efficiency"]


def test_interkey_features_are_in_milliseconds() -> None:
    features = compute_features(
        {
            "keystrokes": [
                {"key": "a", "down_time": 0.0, "up_time": 0.1},
                {"key": "b", "down_time": 1.0, "up_time": 1.1},
                {"key": "c", "down_time": 2.5, "up_time": 2.6},
            ]
        }
    )
    assert features["keystroke_mean_interkey_ms"] == pytest.approx(1250.0)
    assert features["keystroke_std_interkey_ms"] == 250.0
    assert features["keystroke_mean_hold_ms"] == pytest.approx(100.0)
