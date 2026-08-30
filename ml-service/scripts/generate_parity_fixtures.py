"""Generate /fixtures/feature-parity.json from the canonical features.py.

The expected vectors are computed by the canonical implementation and stored
so both the Python and TypeScript test suites can assert against the same
numbers (SPEC §12 cross-language parity / signature feature #8).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.features import compute_features  # noqa: E402

FIXTURES = {
    "human-typing": {
        "keystrokes": [
            {"key": "a", "down_time": 1714045000.1, "up_time": 1714045000.22},
            {"key": "b", "down_time": 1714045000.5, "up_time": 1714045000.66},
            {"key": "c", "down_time": 1714045000.9, "up_time": 1714045001.05},
            {"key": "d", "down_time": 1714045001.35, "up_time": 1714045001.52},
            {"key": "e", "down_time": 1714045001.8, "up_time": 1714045001.9},
        ],
        "mouse_moves": [
            {"x": 100, "y": 100, "t": 1714045000.3},
            {"x": 140, "y": 180, "t": 1714045000.7},
            {"x": 120, "y": 220, "t": 1714045001.1},
            {"x": 200, "y": 250, "t": 1714045001.5},
            {"x": 260, "y": 230, "t": 1714045001.9},
            {"x": 280, "y": 300, "t": 1714045002.3},
        ],
        "touch_moves": [],
        "clicks": [{"x": 280, "y": 300, "t": 1714045002.4}],
        "signals": {"paste_events": 1, "keyless_fills": 0, "input_modality": "mouse"},
    },
    "bot-uniform": {
        "keystrokes": [
            {"key": "a", "down_time": 1714045000.0, "up_time": 1714045000.08},
            {"key": "b", "down_time": 1714045000.08, "up_time": 1714045000.16},
            {"key": "c", "down_time": 1714045000.16, "up_time": 1714045000.24},
            {"key": "d", "down_time": 1714045000.24, "up_time": 1714045000.32},
            {"key": "e", "down_time": 1714045000.32, "up_time": 1714045000.4},
        ],
        "mouse_moves": [
            {"x": 0, "y": 0, "t": 1714045000.0},
            {"x": 10, "y": 10, "t": 1714045000.05},
            {"x": 20, "y": 20, "t": 1714045000.1},
            {"x": 30, "y": 30, "t": 1714045000.15},
            {"x": 40, "y": 40, "t": 1714045000.2},
        ],
        "touch_moves": [],
        "clicks": [{"x": 40, "y": 40, "t": 1714045000.25}],
        "signals": {"paste_events": 0, "keyless_fills": 0, "input_modality": "keyboard"},
    },
    "screen-reader": {
        "keystrokes": [
            {"key": "a", "down_time": 1714045000.0, "up_time": 1714045000.4},
            {"key": "b", "down_time": 1714045000.5, "up_time": 1714045000.9},
            {"key": "c", "down_time": 1714045001.0, "up_time": 1714045001.35},
            {"key": "d", "down_time": 1714045001.6, "up_time": 1714045002.0},
            {"key": "e", "down_time": 1714045002.1, "up_time": 1714045002.45},
        ],
        "mouse_moves": [],
        "touch_moves": [],
        "clicks": [],
        "signals": {"paste_events": 0, "keyless_fills": 0, "input_modality": "keyboard"},
    },
    "empty": {
        "keystrokes": [],
        "mouse_moves": [],
        "touch_moves": [],
        "clicks": [],
        "signals": {},
    },
}

cases = []
for name, raw in FIXTURES.items():
    cases.append({"name": name, "input": raw, "expected": compute_features(raw)})

out = Path(__file__).resolve().parents[2] / "fixtures" / "feature-parity.json"
out.write_text(json.dumps({"generated_by": "ml-service/app/features.py", "cases": cases}, indent=2) + "\n")
print(f"wrote {out} with {len(cases)} cases")