"""Phase 9 B1 — confidence report generation.

Feeds a fixture dataset (trial decisions + an accessibility persona that
resolves to bot) into build_report and asserts: valid HTML with all required
sections, and that a blocked accessibility persona flags the report as
FAILING.
"""

import importlib
import sys
from pathlib import Path


def _find_scripts_dir() -> str:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "scripts"
        if (candidate / "generate_confidence_report.py").exists():
            return str(candidate)
    raise FileNotFoundError("scripts/generate_confidence_report.py not found")


sys.path.insert(0, _find_scripts_dir())
_report = importlib.import_module("generate_confidence_report")
build_report = _report.build_report


def _fixture(accessibility_passed: bool) -> dict:
    return {
        "window_start": "2026-08-29T00:00:00+00:00",
        "window_end": "2026-08-29T12:00:00+00:00",
        "model_version": "v1",
        "traffic": {"allow": 420, "challenge": 60, "block": 20},
        "top_reason_codes": [
            {"code": "uniform_keystroke_rhythm", "count": 40, "avg_weight": 0.51},
            {"code": "linear_mouse_path", "count": 22, "avg_weight": 0.44},
        ],
        "accessibility": [
            {"persona": "screen-reader", "decision": "allow", "score": 0.9, "passed": True},
            {"persona": "switch", "decision": "challenge", "score": 0.4, "passed": True},
            {
                "persona": "tremor",
                "decision": "bot" if not accessibility_passed else "allow",
                "score": 0.1 if not accessibility_passed else 0.85,
                "passed": accessibility_passed,
            },
        ],
        "pii_flagged": 0,
        "examples": [
            {
                "session_id": "5c1e…-abcd",
                "decision": "block",
                "reason_codes": [{"code": "uniform_keystroke_rhythm"}],
            }
        ],
        "latency": {"mean_ms": 9, "p95_ms": 22},
        "services": {"gateway": "UP", "ml": "UP"},
    }


def test_report_html_contains_all_required_sections() -> None:
    html, passed = build_report(_fixture(accessibility_passed=True))
    assert passed is True
    for marker in (
        "<title>StealthGuard trial report",
        "What would have happened",
        "Accessibility stress test",
        "Data minimization",
        "Example decisions",
        "Latency & health",
        "0 of 3 assistive-technology sessions",
        "uniform_keystroke_rhythm",
    ):
        assert marker in html, f"missing section: {marker}"


def test_blocked_accessibility_persona_flags_report_as_failing() -> None:
    html, passed = build_report(_fixture(accessibility_passed=False))
    assert passed is False
    assert "FAIL" in html
    assert "1 of 3 assistive-technology sessions" in html


def test_pii_flagged_fails_report() -> None:
    fixture = _fixture(accessibility_passed=True)
    fixture["pii_flagged"] = 2
    _, passed = build_report(fixture)
    assert passed is False
