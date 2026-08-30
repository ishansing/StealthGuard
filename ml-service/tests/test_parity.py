"""Cross-language parity guard (SPEC §12): the canonical features.py must keep
producing the numbers stored in /fixtures/feature-parity.json, which the
TypeScript SDK port asserts against too — locking the two languages together.
"""

import json
from pathlib import Path

import pytest

from app.features import compute_features


def _find_fixture() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "fixtures" / "feature-parity.json"
        if candidate.exists():
            return candidate
    raise FileNotFoundError("fixtures/feature-parity.json not found")


FIXTURE = _find_fixture()


def test_parity_fixture_matches_canonical_features() -> None:
    data = json.loads(FIXTURE.read_text())
    assert data["cases"], "fixture must contain cases"
    for case in data["cases"]:
        actual = compute_features(case["input"])
        for feature, expected in case["expected"].items():
            assert feature in actual, f"{case['name']}: missing {feature}"
            assert actual[feature] == pytest.approx(
                expected, rel=1e-9
            ), f"{case['name']}: {feature} = {actual[feature]}, expected {expected}"


def test_fixture_file_exists() -> None:
    assert FIXTURE.exists(), "run scripts/generate_parity_fixtures.py to regenerate"
