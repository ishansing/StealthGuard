# StealthGuard Analyst Dashboard

Operational visibility and human-in-the-loop review for StealthGuard. See
[`docs/admin-dashboard.md`](../../../docs/admin-dashboard.md) for the full
description.

## Run

```bash
cd frontend && bun run dev:admin   # http://localhost:5174
# or, with the full stack:
make up
```

The dashboard talks to the gateway on `http://localhost:8080` by default
(override with `VITE_GATEWAY_URL`).

## Build

```bash
cd frontend && bun run build:admin
```

## Test

Component tests live next to the components (`*.test.tsx`, Vitest + Testing
Library); run from the frontend root with `bun run test`. End-to-end:
`bun run test:e2e` (requires the stack to be up).

## Structure

- `src/api.ts` — typed gateway client (`/admin/sessions`, `/admin/stats`,
  `/admin/feedback`).
- `src/components/StatsCharts.tsx` — score histogram + decision funnel.
- `src/components/SessionTable.tsx` — live session list (5 s polling).
- `src/components/SessionDetail.tsx` — mouse-path canvas, keystroke chart,
  reviewer actions.
