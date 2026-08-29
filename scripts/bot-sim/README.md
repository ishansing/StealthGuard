# Bot Behavior Simulator

> **Ethical scope:** this tool exists **only** to produce labeled data for
> training and evaluating *this project's own* classifier (SPEC §1 Non-goals).
> It is not a tool for evading or reverse-engineering any third-party
> bot-detection or CAPTCHA product, and the `replay` persona is intended for
> testing this system's own replay/anti-tamper defenses.

Playwright-driven synthetic session generator for the StealthGuard demo. For
each persona it generates a deterministic event *plan*, drives the **real demo
login form** in a headless browser so the SDK captures the events and the
gateway records a session, and writes the plan out as a labeled CSV (consumed
by `ml-service/training/train.py`) plus raw telemetry logs.

## Personas

| Persona | Behavior | Label |
|---|---|---|
| `human` | varied keystroke holds/intervals, occasional pauses, curved mouse path | human |
| `naive` | perfectly uniform key intervals, straight-line mouse | bot |
| `scripted-jitter` | uniform base + small noise, still separable from human variance | bot |
| `adaptive` | randomized jitter, occasional pauses, non-uniform digraph timing calibrated to just undercut the current model's boundary | bot |
| `replay` | replays a captured human session verbatim (direct telemetry POST — tests replay defenses, not evasion) | human |
| `screen-reader` / `switch` / `tremor` | accessibility personas (must never resolve to `block`) | human |

## Red-team loop (Phase 9 A4)

```bash
make redteam    # 8 adaptive sessions vs the current model, reports evasion,
                # folds into training if evasion exceeds 30%, then retrains
```

The `adaptive` persona is regenerated per run against whatever model is
currently active, and `test_adaptive_persona.py` guarantees it stays
statistically distinguishable from real recorded human variance — so folding
its data back into training hardens the model against evaders without training
it to reject real humans. This persona exists only to harden this project's own
classifier, consistent with the ethical-scope note above.

## Usage

```bash
bun install
bun run seed --human 5 --naive 3 --jitter 2 --replay 1 \
  --out out --demo http://localhost:5173 --gateway http://localhost:8080
```

Requires the stack to be up (`make up`). Outputs in `out/`:

- `sessions.csv` — one row per event:
  `session_id,label,event_type,ts,key,down_time,up_time,x,y`
- `<session_id>.json` — raw telemetry logs (replay source).

## Make targets

```bash
make seed    # 5 human + 3 naive + 2 jitter sessions into DB + CSV
make train   # trains LR/RF on out/sessions.csv, registers v1, reloads ml-service
```

## Tests

`bun run test` asserts per-persona statistics: `naive` keystroke-interval std
near zero with a straight mouse path; `scripted-jitter` measurably higher but
still far below human variance.