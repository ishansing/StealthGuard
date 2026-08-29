# ADR-0011: Accessibility-Aware Thresholds

- Status: Accepted
- Date: 2026-08-29

## Context

StealthGuard targets government-style portals whose users include people using
screen readers, switch devices, and assistive input. A single global threshold
treats a keyboard-only screen-reader user and a switch-device user the same as
a mouse user — and risks silently blocking people the system is supposed to
protect. This is a fairness requirement, not a nice-to-have.

## Decision

Add input-modality context (`meta.input_modality`, already in the telemetry
schema) and assistive-technology signals to the feature vector, and support
**per-modality threshold profiles** in `DecisionService`/`MLScorer`
configuration instead of one global cutoff. Each modality (mouse, keyboard,
switch, tremor-affected mouse) can carry its own `human`/`bot` thresholds.

The simulator gains accessibility personas (screen-reader keyboard-only,
switch device with long dwell, tremor-affected mouse with elevated but genuine
micro-tremor). These personas must resolve to `allow` or, at worst, `challenge`
with the audio alternative — **never silently `block`** — enforced by a
hard-failing test.

## Consequences

- Thresholds become context-aware; a modality profile can be tuned without
  affecting others.
- The accessibility personas are part of the confidence report (B1) so an
  adopting org sees an explicit pass/fail statement before enabling.
- Test coverage guarantees the "zero blocks for accessibility personas"
  invariant is enforced in CI, not just documented.