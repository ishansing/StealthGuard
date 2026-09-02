# StealthGuard

**Privacy-first passive bot detection.** StealthGuard tells a human apart from
a scripted bot by watching *how* someone types and moves a mouse — no CAPTCHA,
no puzzle, no device fingerprinting dossier. Fully self-hosted, explainable,
and data-minimal: a TypeScript SDK collects behavioral signal, a Java gateway
enforces policy, a FastAPI service scores it, and Postgres records what
happened.

This is a **reference implementation** of the pattern — built to be read,
defended, and extended, not just demoed.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Usage & local development](#usage--local-development)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Observability](#observability)
- [Project layout](#project-layout)
- [Documentation](#documentation)
- [License](#license)

## Features

| Feature | Why it matters |
|---|---|
| **Explainable humanness score** | every decision ships top-3 human-readable reason codes (`uniform_keystroke_rhythm`, `linear_mouse_path`), not an opaque number |
| **Privacy mode** | the SDK can compute features client-side and never transmit raw coordinates or keys |
| **Fail-safe policy** | if scoring is unavailable, the gateway answers `challenge`, never silently `allow` |
| **Accessible fallback** | the challenge path is keyboard-operable, ARIA-announced, and has an audio alternative |
| **Analyst dashboard** | live sessions, score distribution, decision funnel, mouse-path replay, human-in-the-loop review |
| **Bot simulator** | Playwright-driven synthetic sessions (human / uniform-bot / jitter-bot) for training and demoing |
| **Trained model** | Logistic Regression + Random Forest selected by cross-validated AUC; shadow-mode validation before promotion |
| **Cross-language parity** | Python and TypeScript feature formulas are locked together by shared fixtures |
| **One-command demo** | `make demo` takes a clean checkout to a running, seeded, trained system |

## Architecture

```
User in Browser ──▶ SDK (TypeScript) ──▶ Java Gateway ──▶ Python ML Service
                                             │                 │
                                             └──────▶ Postgres ◀─┘
                         ┌───────── Analyst Dashboard (React)
                         └───────── Bot Simulator (Playwright CLI)
```

1. The **SDK** opens a session and records keystroke/pointer/touch timings.
2. The **gateway** persists raw telemetry, delegates feature computation to the
   ML service (one canonical `features.py`), scores, and applies policy:
   `score ≥ 0.8 → allow`, `≤ 0.4 → block`, else `challenge`.
3. The **ML service** returns a humanness score plus explainable reason codes.
4. The **dashboard** replays sessions and lets analysts correct decisions,
   feeding `feedback` back into retraining.

## Getting started

### Prerequisites

- Docker with Docker Compose v2 (Docker ≥ 25)
- ~4 GB free RAM for the local stack
- Nothing else — the stack is fully self-contained and works offline after the
  first `docker compose build`

### One-command demo

```bash
git clone <repo> && cd stealthguard
cp .env.example .env
make demo          # build, boot, seed 10 sessions, train + register v1
```

`make demo` runs `up` → `seed` → `train`. When it finishes:

| App | URL |
|---|---|
| Demo login | http://localhost:5173 |
| Analyst dashboard | http://localhost:5174 |
| Gateway API (Swagger) | http://localhost:8080/swagger-ui.html |
| ML service API docs | http://localhost:8000/docs |

Walk through it with [`docs/demo-script.md`](docs/demo-script.md).

## Usage & local development

```bash
make up       # build + start the whole stack
make seed     # record 5 human + 3 naive + 2 jitter sessions (DB + CSV)
make train    # train LR/RF on the seed CSV, register v1, reload ml-service
make retrain  # fold reviewer feedback into training; write a shadow report
make observability  # optional Prometheus + Grafana overlay
make test     # every service's test suite
make lint     # every service's linter
make smoke    # health + key API checks
make logs     # follow all service logs
make down     # stop and wipe volumes (fresh start)
```

Per-service suites run independently: `./mvnw test` (gateway), `pytest`
(ML), `bun run test` (frontend). The bot simulator has its own tests in
`scripts/bot-sim`.

## Configuration

All settings live in `.env` (copy from [`.env.example`](.env.example)) and are
consumed by Docker Compose:

| Group | Notable vars |
|---|---|
| Postgres | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Policy | `HUMAN_ALLOW_THRESHOLD` (0.8), `BOT_BLOCK_THRESHOLD` (0.4), `CHALLENGE_ANSWER` |
| ML | `ML_SERVICE_URL`, `ML_TIMEOUT`, `HUMAN_THRESHOLD`, `BOT_THRESHOLD`, `MODEL_VERSION_SHADOW` |
| Abuse guards | `MAX_EVENTS_PER_ARRAY` (5000) |
| Gateway | `HMAC_ENABLED` (Stretch), `LOG_LEVEL` |

## Try it risk-free — evaluate before you enforce

Run StealthGuard in **log-only trial mode**: every request is scored and the
real would-have-been decision is persisted, but the caller always gets
`allow`. After a trial window, generate a **deployment-confidence report** that
answers "what happens if we turn this on?" with evidence — traffic breakdown,
an accessibility pass/fail, a zero-PII confirmation, anonymized reason-code
examples, and latency/health:

```bash
TRIAL_MODE=true docker compose up -d java-gateway   # log-only
# … drive traffic (real or seeded) …
make report                                          # docs/reports/trial-<date>.html
```

See the [Trial Guide](docs/trial-guide.md). A real example:
[`docs/reports/trial-2026-08-29.html`](docs/reports/trial-2026-08-29.html).

## Deployment

The stack is a **local-sandbox reference build** (see [SPEC.md](SPEC.md) §1) —
do not expose it to the public internet as-is. For persistent, production-ish
operation — volumes, backups, hardening notes, and the observability overlay —
see the **[Deployment Guide](docs/deployment.md)**.

## Observability

- Every backend emits **structured JSON logs** carrying `session_id` and
  `latency_ms`.
- Gateway: `/actuator/prometheus` · ML: `/metrics`.
- `make observability` brings up Prometheus + Grafana with a pre-provisioned
  StealthGuard dashboard (request rate + p95 latency).

See [docs/observability.md](docs/observability.md).

## Project layout

| Path | Contents |
|---|---|
| `frontend/packages/stealthguard-sdk` | telemetry SDK (`raw` / `aggregated` modes) |
| `frontend/apps/demo` | login form wired to the gateway + accessible challenge |
| `frontend/apps/admin` | analyst dashboard (replay, funnel, feedback) |
| `java-gateway` | Spring Boot gateway (ingest, policy, fail-safe) |
| `ml-service` | FastAPI scoring, canonical `features.py`, training |
| `scripts/bot-sim` | Playwright-driven synthetic session generator |
| `scripts/retrain_from_feedback.py` | feedback → retrain → shadow report |
| `infra/` | Flyway SQL migrations, Prometheus/Grafana config |
| `docs/` | ADRs, design docs, API contracts, demo script |
| `fixtures/` | cross-language parity vectors |

## Documentation

- Full specification: [`SPEC.md`](SPEC.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- Data model: [`docs/data-model.md`](docs/data-model.md)
- ML design: [`docs/ml-design.md`](docs/ml-design.md)
- Threat model: [`THREAT_MODEL.md`](THREAT_MODEL.md)
- SDK integration: [`docs/sdk-integration-guide.md`](docs/sdk-integration-guide.md)
- Deployment: [`docs/deployment.md`](docs/deployment.md)
- Frontend rules for agents: [`frontend/AGENT_GUIDELINES.md`](frontend/AGENT_GUIDELINES.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md) · Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## License

[MIT](LICENSE)