# Demo Script

A 3–5 minute, judge-facing walkthrough of StealthGuard. Targets a stack
already prepared with `make demo` (up + seeded + trained).

> Screenshots/GIFs: placeholders — capture from the live stack before a
> formal demo.

## 0. Pre-flight (do before the judge arrives)

```bash
make demo          # clean → running, seeded, trained
./scripts/smoke_test.sh
```

Confirm: demo on `:5173`, dashboard on `:5174`, Swagger on `:8080/swagger-ui.html`.

## 1. Normal login → allow (60 seconds)

- Open **http://localhost:5173**.
- Say: *"StealthGuard watches how you type and move — no CAPTCHA."*
- Type a username/password **normally**, with natural pauses, and move the
  mouse around the page.
- Click **Sign in**.
- Point at the decision line: **`allow`** with a score near 1.0 and human
  reason codes (`natural_keystroke_variance`, `nonlinear_mouse_path`).

## 2. A bot tries the same form → block (60 seconds)

- Switch to a terminal and run:

  ```bash
  cd scripts/bot-sim && bun run seed --naive 2 --jitter 2 --out /tmp/bot-demo --seed 7
  ```

- Wait for the summary lines: `naive-0 [bot] -> Decision: block (score 0.003)`.
- Say: *"Perfectly uniform keystrokes and a straight-line mouse — the
  signature of a scripted bot."*
- Optional: refresh the demo page (new session) and let the bot drive it via
  the CLI if a live demo feels better — the dashboard will show the blocked
  sessions either way.

## 3. Analyst dashboard — why the decision (90 seconds)

- Open **http://localhost:5174**.
- Show the **decision funnel** (allow / block / challenge) and **score
  histogram** (two clear peaks: bots ~0, humans ~1).
- Click a **bot session** row → its detail shows the canvas **mouse-path
  replay** (a straight line) and the **keystroke hold-time chart** (uniform
  bars).
- Point at the **reason codes**: `uniform_keystroke_rhythm`,
  `linear_mouse_path` — *"the model explains its call, it doesn't just
  black-box a number."*
- Click **Mark as human** on a borderline session → *"feedback lands in the
  `feedback` table and can be folded back into the next training run."*

## 4. Fail-safe posture (30 seconds, optional)

- `docker compose stop ml-service`, then submit a telemetry POST
  (`./scripts/smoke_test.sh` shows the path) — the gateway answers
  **`challenge`**, never `allow` (ADR 0005).
- `docker compose start ml-service` to restore.

## 5. Wrap-up (30 seconds)

- Mention: everything runs locally, nothing leaves the machine; raw telemetry
  is retention-purged; the model is explainable by construction (logistic
  regression coefficients); and the SDK's `aggregated` privacy mode never
  transmits raw coordinates/keys.

## If something goes wrong

- `make logs` to follow all services.
- `make down && make demo` for a clean restart.
- Bot scored `allow`? The seeded model is small; run `make seed` with more
  `--human` sessions and `make train` to retrain.