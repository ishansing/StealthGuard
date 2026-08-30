# ADR-0010: Adversarial Evaluation Loop

- Status: Accepted
- Date: 2026-08-29

## Context

A classifier that is never tested against attempts to defeat it will silently
rot: the `naive` and `scripted-jitter` personas are static, so a model tuned to
them may be trivially evaded by a slightly smarter bot. Phase 9 (A4) adds an
`adaptive` persona that deliberately undercuts the *current* model's decision
boundary.

## Decision

Add an `adaptive` persona to `scripts/bot-sim` whose jitter, pauses, and
digraph timing are calibrated against the currently active model (via its
`metadata.json` / `model.pkl`), regenerated on each `make redteam` run rather
than hardcoded once. `make redteam` generates a batch, reports the evasion
rate (fraction still classified human), and optionally folds the persona's data
back into training if evasion exceeds a documented threshold.

The persona exists strictly to evaluate and harden **this project's own**
classifier and trial report — consistent with the simulator's existing
ethical-scope note. It is not a general-purpose evasion tool and is not
documented as one.

## Consequences

- The model is continuously probed at its boundary, so drift is visible
  instead of silent.
- Folding adversarial data back in requires an explicit threshold crossing and
  is gated, so the model can't be overtrained against the simulator at the
  expense of real humans — guarded by `test_adaptive_persona.py`, which
  asserts the persona stays statistically distinguishable from real recorded
  human sessions.