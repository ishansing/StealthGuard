# Threat Model

A lightweight STRIDE pass on the public telemetry endpoint
(`POST /stealthguard/telemetry`) and the surrounding path (SPEC §10). This is a
local-sandbox reference build; the goal is architectural honesty, not a claim
of production hardening.

## Assets

- **Session and telemetry data** (`sessions`, `telemetry_events`) — behavioral
  signal; privacy-sensitive even though PII-shaped fields are rejected.
- **Scores and decisions** (`scores`, `decisions`) — the policy output a
  portal would act on.
- **ML model artifacts** (`model.pkl`) — not user data, but integrity matters.

## STRIDE

| Threat | Assessment | Mitigation |
|---|---|---|
| **Spoofing** — a client claims to be a real browser/human | High: the SDK is just a JS client; its telemetry is forgeable | Fail-safe policy (ADR 0005) means spoofed "human-like" signal can at most earn `allow`, which a human could also earn; tamper-evident HMAC signing is a Stretch (Phase 3+) that raises the bar to *replaying* a genuine session |
| **Tampering** — modifying telemetry mid-flight (network MITM) | Medium (local only); the signed payload Stretch closes this | TLS in production; HMAC signing (Stretch) binds payload to session |
| **Repudiation** — a bot denies it acted | Medium | Every decision is persisted with reason codes + model version, giving an audit trail (Phase 5 dashboard exposes it) |
| **Information disclosure** — PII entering the system | High if unchecked | Runtime PII-shape guard on the gateway (`PiiFilter`, 422) and on the ML service; schema has no PII columns; retention purge for raw telemetry (§10) |
| **Denial of service** — flooding `/telemetry` | Medium | Array-size caps (5,000 events), session/ML client timeouts + circuit breaker; rate limiting (Bucket4j) is a Stretch |
| **Elevation of privilege** — abusing the detector to escalate | Low | The gateway has no privileged actions; decisions are advisory |

## Boundary notes

- **No device tracking** by design: no persistent device IDs, canvas/WebGL
  fingerprinting, or cookies beyond the session — so the "fingerprinting
  dossier" class of threat is out of scope by construction (SPEC §2).
- **ML service is internal**: the compose network exposes only the gateway,
  ML, and frontend ports; `/score` is not meant for browsers. It is still
  PII-guarded and fail-safe because the gateway treats it as untrusted during
  an incident.
- **Client-supplied `correct` flag** in challenge responses is *not* trusted:
  correctness is verified server-side against a configured answer.

## Residual risks (accepted for a sandbox)

- A determined adversary can craft arbitrary telemetry; without HMAC signing,
  nothing distinguishes it from a real human's — the classifier only makes it
  harder, not impossible.
- The synthetic bot simulator (Phase 6) trains the model on simulated signal;
  real-world distribution shift is expected and out of scope here.