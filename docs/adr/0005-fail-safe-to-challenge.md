# ADR-0005: Fail Safe to Challenge

- Status: Accepted
- Date: 2026-08-26

## Context

When the ML service times out, retries exhaust, or its circuit breaker opens,
the gateway still must answer the SDK's telemetry POST. The riskiest default
is silent `allow` (bots get through); the safest is `block`, but that punishes
legitimate users when the failure is transient. SPEC §5 requires "unknown →
`challenge`, never `allow`".

## Decision

**Any ML-path failure degrades to `challenge`, never `allow`.** The gateway
persists a `decisions` row with `decision = 'challenge'` and
`reason = 'ml-service unavailable'`, and returns that to the SDK. The
accessible fallback challenge (Phase 4) is the human escape hatch; the analyst
dashboard can review the case later.

Resilience is layered before the fail-safe kicks in: WebClient timeout (2s),
one retry with backoff, and a Resilience4j circuit breaker so a down ML
service doesn't hammer it — all on `MlServiceClient`.

## Consequences

- A silent `allow` is impossible when the detector is unavailable.
- Transient failures surface as `challenge` — slightly more friction than
  `allow`, but recoverable via the challenge UI.
- The fail-safe is enforced in `TelemetryService.ingest` (the single
  orchestration point), not scattered across callers.