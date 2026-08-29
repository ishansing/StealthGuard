# StealthGuard — Privacy-First Passive Bot Detection

StealthGuard passively tells a human apart from a bot by watching *how*
someone types and moves a mouse — no CAPTCHA, no puzzle, no device
fingerprinting dossier. It is a local-sandbox **reference implementation** of a
*passive, explainable, privacy-minimizing* bot-detection system: a TypeScript
SDK collects behavioral signal, a Spring Boot gateway enforces policy, a
FastAPI service scores it, and Postgres remembers what happened.

> Status: **phases 0–7 complete** — `make demo` takes a clean checkout to a
> running, seeded, trained, demo-ready system. Build plan: [`SPEC.md`](SPEC.md).
> Phase 8 (observability) remains as stretch.

## How it works

```
User in Browser ──▶ SDK (TypeScript) ──▶ Java Gateway ──▶ Python ML Service
                                             │                 │
                                             └──────▶ Postgres ◀─┘
```

1. The **SDK** (`@stealthguard/sdk`) opens a session and quietly records
   keystroke/pointer/touch timings. In `aggregated` mode it computes features
   client-side and never transmits raw coordinates or keys.
2. The **gateway** persists raw telemetry, delegates feature computation to the
   ML service (one canonical `features.py` — no train/serve skew), scores, and
   applies the policy: `score ≥ 0.8 → allow`, `≤ 0.4 → block`, else
   `challenge`. **Any ML failure degrades to `challenge`, never `allow`.**
3. The **ML service** returns a humanness score, a label, and **reason codes**
   (top-3 `coefficient × feature` contributions) so every decision is
   defensible, not a black box.
4. The **analyst dashboard** replays the mouse path, shows the score
   distribution, and lets a reviewer correct decisions — feeding `feedback`
   back into retraining.

A **bot simulator** (`scripts/bot-sim`) generates labeled synthetic sessions
(human, uniform-bot, jitter-bot) to train the classifier and to drive the demo.

## One-command demo

```bash
cp .env.example .env
make demo          # build, boot, seed 10 sessions, train + register v1
```

Then open:

| App | URL |
|---|---|
| Demo login | http://localhost:5173 |
| Analyst dashboard | http://localhost:5174 |
| Gateway Swagger UI | http://localhost:8080/swagger-ui.html |
| ML service docs | http://localhost:8000/docs |

See [`docs/demo-script.md`](docs/demo-script.md) for the 3–5 minute walkthrough.

## Screenshots

![Demo — human login allowed](./docs/images/demo-allow.png)
![Dashboard — decision funnel & score distribution](./docs/images/dashboard-stats.png)
![Dashboard — session replay & reason codes](./docs/images/dashboard-session.png)

## Make targets

```bash
make up      # build + start the whole stack
make seed    # record 5 human + 3 naive + 2 jitter sessions (DB + CSV)
make train   # train LR/RF on the seed CSV, register v1, reload ml-service
make demo    # up → seed → train
make test    # every service's test suite
make lint    # every service's linter
make smoke   # health + key API checks
make down    # stop and wipe volumes
```

## Repository layout

| Path | Contents |
|---|---|
| `frontend/packages/stealthguard-sdk` | telemetry SDK (raw/aggregated modes) |
| `frontend/apps/demo` | login form wired to the gateway + accessible challenge |
| `frontend/apps/admin` | analyst dashboard (replay, funnel, feedback) |
| `java-gateway` | Spring Boot gateway (ingest, policy, fail-safe) |
| `ml-service` | FastAPI scoring, `features.py` (canonical), training |
| `scripts/bot-sim` | Playwright-driven synthetic session generator |
| `infra/` | Flyway SQL migrations |
| `docs/` | ADRs, design docs, API contracts, demo script |
| `fixtures/` | cross-language parity vectors |

## Documentation

- Full spec: [`SPEC.md`](SPEC.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- Data model: [`docs/data-model.md`](docs/data-model.md)
- ML design: [`docs/ml-design.md`](docs/ml-design.md)
- Threat model: [`THREAT_MODEL.md`](THREAT_MODEL.md)
- SDK integration: [`docs/sdk-integration-guide.md`](docs/sdk-integration-guide.md)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md) · Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## License

MIT — see [`LICENSE`](LICENSE).