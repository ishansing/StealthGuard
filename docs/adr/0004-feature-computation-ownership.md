# ADR-0004: Feature Computation Ownership

- Status: Accepted
- Date: 2026-08-26

## Context

The gateway ingests raw telemetry (§6.2) and the ML service scores a feature
vector (§6.3). The same 12 formulas must be shared everywhere to avoid
train/serve skew (§9.2, signature feature #8). Options:

1. Compute features in the gateway (Java port of the formulas).
2. Compute features in the Python service (canonical `features.py`), with the
   gateway delegating.
3. Compute features in the SDK (aggregated/privacy mode).

## Decision

**The gateway persists raw events and delegates feature computation to the
Python service.** A new `POST /features` endpoint takes raw telemetry and
returns the canonical feature vector; the gateway then calls `POST /score` with
that vector. `ml-service/app/features.py` remains the single source of truth.

In `privacy_mode: aggregated`, the SDK sends a pre-computed feature block, and
the gateway forwards it straight to `/score` (no `/features` call) — so the
SDK port must still match `features.py` exactly (enforced by the Phase 4
cross-language parity tests).

## Consequences

- One canonical implementation of the formulas (Python); no Java copy to drift.
- Two ML round-trips per raw telemetry flush (`/features` + `/score`) — fine
  locally (p95 target < 150 ms end-to-end).
- The SDK's TypeScript port is only exercised in aggregated mode, so parity
  tests are the enforcement mechanism that keeps it honest.