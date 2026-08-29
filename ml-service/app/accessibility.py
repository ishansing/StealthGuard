"""Accessibility personas (Phase 9 A5/B1).

These synthetic personas exist strictly to evaluate and harden this project's
own classifier and its confidence report. They must never resolve to `block` —
enforced by test_accessibility_personas.py and surfaced as an explicit
pass/fail in the trial confidence report (B1).

Per-modality profiles mirror the gateway's application.yml:
- keyboard: (0.6, 0.2)
- touch: (0.7, 0.3)
- switch: (0.5, 0.0)  # switch users can't be silently blocked
"""

TEXT = "alicespring2026"

MODALITY_THRESHOLDS = {
    "keyboard": (0.6, 0.2),
    "touch": (0.7, 0.3),
    "switch": (0.5, 0.0),
}


def screen_reader_telemetry() -> dict:
    """Screen-reader user: keyboard-only, slow natural typing with pauses."""
    keys = []
    t = 0.0
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


def switch_telemetry() -> dict:
    """Switch-device user: slow dwell movement to each target, then selection."""
    moves = []
    clicks = []
    t = 0.0
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


def tremor_telemetry() -> dict:
    """Tremor-affected mouse user: natural path with elevated, genuine tremor."""
    keys = []
    t = 0.0
    for i, key in enumerate(TEXT):
        hold = (70 + (i % 4) * 40) / 1000
        keys.append({"key": key, "down_time": t, "up_time": round(t + hold, 3)})
        t += hold + (100 + (i % 3) * 80) / 1000
    moves = []
    mt = 0.0
    x, y = 60.0, 60.0
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


ACCESSIBILITY_PERSONAS: dict[str, dict] = {
    "screen-reader": screen_reader_telemetry(),
    "switch": switch_telemetry(),
    "tremor": tremor_telemetry(),
}
