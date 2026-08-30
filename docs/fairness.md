# Accessibility & Fairness

StealthGuard targets government-style portals whose users include people using
screen readers, switch devices, and assistive input. A single global threshold
would treat those users the same as a mouse user — and risk silently blocking
people the system is supposed to protect. This is a fairness requirement, not
a nice-to-have (SPEC Phase 9 A5, ADR-0011).

## Per-modality threshold profiles

Thresholds are no longer one global cutoff. The gateway's `DecisionService`
(and the ML scorer's label) pick a profile by `meta.input_modality`:

| Modality | human (`allow`) | bot (`block`) | Why |
|---|---|---|---|
| mouse (default) | 0.8 | 0.4 | §8.1 policy unchanged |
| keyboard | 0.6 | 0.2 | screen-reader / keyboard-only users |
| touch | 0.7 | 0.3 | touch input, moderate variance |
| switch | 0.5 | **0.0** | switch users often cannot type; a score of 0 is required to block |

The `switch` profile's `bot = 0.0` is a deliberate guarantee: no switch-modality
session is silently blocked — it resolves to `challenge` (the audio-alternative
path) or `allow`. This trades a little strictness for switch users to honor the
"never silently block" invariant; a *mouse-modality* bot cannot claim this
profile (the modality comes from the observed events, not the client).

## Accessibility personas

The bot simulator ships three accessibility personas
(`scripts/bot-sim`, `--accessibility`):

- **screen-reader** — keyboard-only navigation, slow natural typing with
  pauses (no mouse).
- **switch** — slow dwell movement to each target, then discrete selection
  events (no typing).
- **tremor** — human-like mouse movement with elevated, genuine micro-tremor.

These exist strictly to evaluate and harden **this project's own** classifier
and trial report. `test_accessibility_personas.py` **hard-fails** if any of
them resolves to `block` against the current thresholds, enforced in CI.

Verified live: screen-reader → `allow`, switch → `challenge`, tremor → `allow`.

## Non-negotiables

- The no-PII guard, fail-safe-to-challenge policy for non-trial requests, and
  cross-language feature parity are unchanged by this work.
- Thresholds are config (`HUMAN_ALLOW_THRESHOLD_*` / `BOT_BLOCK_THRESHOLD_*`
  env), so a deployment can tune them without code changes.