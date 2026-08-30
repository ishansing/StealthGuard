# ADR-0007: Extended Feature Set and Parity Ownership

- Status: Accepted
- Date: 2026-08-29

## Context

Phase 9 (A1) adds five behaviorally richer features (Fitts's-law conformance,
micro-tremor, arrival-to-click latency, digraph timing, paste/autofill
detection). ADR-0004 already established that `ml-service/features.py` is the
canonical implementation and that the SDK's TypeScript port must match it.
These new features extend that ownership decision rather than changing it.

## Decision

All five features are canonical in `ml-service/app/features.py`, mirrored
one-for-one in `stealthguard-sdk/src/feature-extraction.ts`, and locked
together by extended `/fixtures/feature-parity.json` vectors (asserted by both
the Python and TypeScript parity tests). No feature may be added to one
language without the other.

The features are designed to be **derivable from the existing raw telemetry
shape** (§6.2) — no new data collection, which keeps the Phase 2/3 PII guard
and data-minimization posture intact.

## Consequences

- The parity fixture is the enforcement mechanism; adding a feature without
  updating both ports breaks CI.
- New features are privacy-neutral (paste/autofill is derived from event
  sequences already captured).
- Rule-based and ML scorers consume the same extended vector, so the baseline
  and the trained model stay comparable.