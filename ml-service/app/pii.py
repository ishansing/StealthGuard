"""Privacy guard: reject requests whose keys look PII-shaped (SPEC §10).

Data minimization is enforced in code, not just policy. Any key matching the
strict set, or containing a sensitive token, causes a 422.
"""

import json
from typing import Any

# Exact key match -> always rejected.
STRICT_PII_KEYS = {
    "email",
    "name",
    "phone",
    "aadhaar",
    "ssn",
    "pan",
    "passport",
    "password",
    "address",
    "dob",
    "government_id",
    "account_number",
}

# Substring match (case-insensitive) -> rejected when present in a key.
SENSITIVE_TOKENS = ("email", "aadhaar", "phone", "ssn", "passport", "pan_card", "account_number")


def _key_is_pii(key: str) -> bool:
    lower = key.lower()
    if lower in STRICT_PII_KEYS:
        return True
    return any(token in lower for token in SENSITIVE_TOKENS)


def contains_pii(value: Any) -> bool:
    """Recursively scan a JSON value's keys for PII-shaped fields."""
    if isinstance(value, dict):
        for key, child in value.items():
            if _key_is_pii(key) or contains_pii(child):
                return True
    elif isinstance(value, list):
        return any(contains_pii(item) for item in value)
    return False


def parse_pii_shape(raw_body: str) -> bool:
    """True if the raw JSON body contains PII-shaped keys."""
    try:
        return contains_pii(json.loads(raw_body))
    except json.JSONDecodeError:
        return False
