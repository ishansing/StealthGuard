# ADR-0012: Shadow Trial Mode

- Status: Accepted
- Date: 2026-08-29

## Context

A prospective org can't evaluate StealthGuard against its own traffic without
either (a) turning on enforcement blindly, or (b) trusting a sales demo. The
question a compliance/procurement reviewer actually asks is "what happens if we
turn this on?" — and it deserves an evidence-backed answer.

## Decision

Add a `TRIAL_MODE=log_only` flag to the Java gateway. In trial mode every
request is scored and a decision is computed and persisted exactly as normal,
but the gateway **always returns `allow`** to the caller. The would-have-been
decision is persisted separately (a `would_have_decision` column / `trial_mode`
boolean), so nothing in trial mode weakens the fail-safe-to-challenge policy
for non-trial requests.

A companion `scripts/generate_confidence_report.py` turns a completed trial
window into a static HTML report: traffic breakdown with top reason codes for
the challenged/blocked cohort, accessibility stress-test pass/fail, an
automated zero-PII scan of the trial's `telemetry_events`, anonymized example
reason codes, and latency/uptime.

## Consequences

- Evaluation never degrades a real user's experience: trial callers always see
  `allow`.
- The persisted `would_have_decision` keeps the audit trail intact — the
  report is evidence, not a promise.
- The PII scan and accessibility pass/fail make the report defensible to a
  reviewer, not just a dashboard.
- Trial mode is explicit and opt-in; it cannot be enabled by accident via a
  normal request, and the fail-safe path is untouched for non-trial traffic.