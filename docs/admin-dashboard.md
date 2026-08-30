# Analyst Dashboard

Operational visibility and human-in-the-loop correction for StealthGuard.
Live sessions, score distribution, decision funnel, per-session mouse-path
replay, and reviewer feedback. Runs at http://localhost:5174.

![Dashboard screenshot placeholder](./images/admin-dashboard.png)

## What you see

- **Session table** (polls `/stealthguard/admin/sessions` every 5 s, newest
  first) — session id, latest decision, score, page, input modality, created.
- **Score distribution** — histogram of the latest scores across sessions
  (10 buckets, `/stealthguard/admin/stats`).
- **Decision funnel** — allow / block / challenge counts.
- **Session detail** (click a row) — decision, score, model version, reason
  codes, a canvas **mouse-path replay** from the raw `mouse_move`/`touch_move`
  events, and a **keystroke hold-time chart**.
- **Reviewer actions** — "Mark as human" / "Mark as bot" POST to
  `/stealthguard/admin/feedback`, writing a `feedback` row (Phase 8's
  `retrain_from_feedback.py` consumes these).

## Run

```bash
make up          # admin app included on :5174
```

The `admin` compose service serves the same frontend image on port 5174.
Standalone: `cd frontend && bun run dev:admin`.

## API surface used

| Endpoint | Purpose |
|---|---|
| `GET /stealthguard/admin/sessions?page=&size=` | Paginated session summaries (newest first) |
| `GET /stealthguard/admin/sessions/{id}` | Detail: decision, score, reason codes, raw events |
| `GET /stealthguard/admin/stats` | Decision counts, label counts, score histogram |
| `POST /stealthguard/admin/feedback` | `{session_id, reviewer, corrected_label}` → `feedback` row |

## Tests

- Component tests (Vitest + Testing Library) render the charts/funnel against
  fixture data and verify a reviewer click posts the correct feedback payload.
- Playwright `e2e/admin-feedback.spec.ts` seeds a session via the API, opens
  the dashboard, and confirms a "Mark as human" click persists via the gateway.

## Feedback loop

Corrections land in `feedback`; Phase 8 folds them back into training
(`scripts/retrain_from_feedback.py`), and shadow-mode comparison reports
measure active vs. candidate model agreement before promotion.