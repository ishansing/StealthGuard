# StealthGuard Sandbox

A standalone demo page where a visitor can **type or paste into a live form and
see it scored immediately** — no integration required. A "try it before you
touch your code" evaluation tool (SPEC Phase 9 B3).

## What it does

- **Live scoring** — as you type and move the mouse, the SDK captures behavior
  and the gateway returns a humanness score; the **Rhythm Line** (bot → human)
  moves with the live score and the decision + reason codes are shown.
- **Compare personas** — one-click buttons post representative bot-simulator
  shapes (naive bot, adaptive bot, tremor user, human-like) to the gateway, so
  a visitor can see how the system would treat different inputs before building
  anything.

## Run

```bash
cd frontend && bun run dev:sandbox   # http://localhost:5175
# or with the full stack:
make up
```

The sandbox talks to the gateway on `http://localhost:8080` (override with
`VITE_GATEWAY_URL`).

## Test

Component tests live next to the source (`App.test.tsx`, Vitest + Testing
Library); run from the frontend root with `bun run test`.

## Notes

The persona shapes here are **illustrative** — the canonical personas live in
`scripts/bot-sim` and are what training/evaluation actually use.