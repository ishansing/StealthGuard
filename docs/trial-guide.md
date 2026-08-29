# Trial Guide — Evaluate Before You Enforce

How an adopting org runs StealthGuard in **log-only mode** against real (or
seeded) traffic for a trial window, then gets evidence-backed answers to
"what happens if we turn this on?" (SPEC Phase 9 B1, ADR-0012).

## What you get

A static HTML **deployment-confidence report** (`docs/reports/trial-<date>.html`) with:

- **Traffic breakdown** — the fraction of trial traffic that *would have been*
  allowed / challenged / blocked, plus the top reason codes for the
  challenged/blocked cohort.
- **Accessibility stress test** — the screen-reader / switch / tremor personas
  run against the trial's active model, with an explicit pass/fail statement.
- **Data-minimization confirmation** — an automated scan of the trial's
  `telemetry_events` confirming zero PII-shaped fields were ever stored.
- **Anonymized examples** — a handful of blocked/challenged sessions (session
  IDs only) with their reason codes, so a reviewer can sanity-check the model.
- **Latency & health** — mean/p95 ingest latency and service health.

## Running a trial

```bash
# 1. Turn on log-only mode and restart the gateway
TRIAL_MODE=true docker compose up -d java-gateway

# 2. Let real (or seeded) traffic flow — nothing is ever blocked or challenged
#    for the caller; every decision is still computed and persisted.
cd scripts/bot-sim && bun run seed --human 5 --naive 3 --jitter 2 --out /tmp/trial --seed 7

# 3. Generate the confidence report over the trial window
make report            # -> docs/reports/trial-<date>.html (+ one-line stdout summary)

# 4. Turn trial mode off when you're ready to enforce
docker compose up -d java-gateway
```

The gateway in trial mode **always returns `allow`** to the caller — a user
never experiences a block or challenge. The real would-have-been decision is
persisted with `trial_mode=true` (plus `latency_ms`), which is exactly what
the report reads.

## Reading the report

- The top banner is **PASS** only if no accessibility persona would have been
  blocked **and** the PII scan is clean. Any failure prints a red banner and
  the generator exits non-zero.
- The traffic breakdown tells you the enforcement impact *before* you turn it
  on — e.g. "53% of trial traffic would have been blocked" is a decision you
  make deliberately, not discover in production.
- Example reason codes make the model auditable: reviewers can see
  `uniform_keystroke_rhythm` or `linear_mouse_path` instead of trusting a
  number.

## Notes

- Trial mode never weakens the fail-safe policy: non-trial requests behave
  exactly as before, and trial-mode decisions are marked so they can't be
  confused with real ones.
- Window scope is `--window-hours` (default 24); adjust to your trial length.
- The PII scan reuses the same guard that rejects PII-shaped fields at
  ingest, so a non-zero result would indicate a guard regression.