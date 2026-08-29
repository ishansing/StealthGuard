# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/) and
[Conventional Commits](https://www.conventionalcommits.org/).

## [1.0.0] — 2026-08-29

StealthGuard v1.0: the full passive bot-detection reference stack, ready to
demo with one command (`make demo`).

### Added

- **Frontend SDK (`@stealthguard/sdk`)** — framework-agnostic telemetry client
  (keystroke/pointer/touch capture, bounded buffers, debounced flush +
  sendBeacon), `aggregated` privacy mode, `useStealthGuard` React hook, built
  to ESM+CJS+types. Cross-language feature parity enforced against the
  canonical Python implementation via shared fixtures.
- **Demo app** — login form wired to the gateway with an accessible fallback
  challenge (ARIA-live, keyboard-operable, audio alternative).
- **Analyst dashboard** — live session table, score histogram, decision funnel,
  mouse-path replay, keystroke timing chart, and reviewer feedback.
- **Java gateway** — session/telemetry/decision/challenge/admin APIs, runtime
  PII guard, ML client with timeout/retry/circuit breaker failing safe to
  `challenge`, externalized decision thresholds.
- **ML service** — explainable scoring (logistic regression reason codes),
  rule-based baseline, canonical feature formulas, training pipeline with
  model registration, PII guard, shadow-mode scaffolding.
- **Database** — Flyway-migrated Postgres schema (sessions, telemetry, scores,
  decisions, model registry, feedback, challenge responses).
- **Bot simulator** — Playwright-driven synthetic session generator with human,
  naive, scripted-jitter, and replay personas; labeled CSV + raw telemetry logs.
- **One-command demo** — `make demo` (up → seed → train), healthchecks on every
  service, expanded smoke script.

### Security

- Fail-safe default: unknown/ML-down → `challenge`, never `allow`.
- Runtime PII-shape rejection on telemetry ingest and scoring.
- STRIDE threat model documented.
- Raw telemetry retention-purged (default 7 days); aggregated features retained
  longer for evaluation.

### Notes

- Local-sandbox reference build; not production-hardened (see SPEC §1).
- HMAC telemetry signing, per-session rate limiting, and observability stack
  remain as documented stretch items.

[1.0.0]: https://example.invalid/stealthguard/tree/v1.0.0