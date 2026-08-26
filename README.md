# StealthGuard — Privacy-First Passive Bot Detection

StealthGuard passively tells a human apart from a bot by watching *how*
someone types and moves a mouse — no CAPTCHA, no puzzle, no device
fingerprinting dossier. It is a local-sandbox **reference implementation** of
a *passive, explainable, privacy-minimizing* bot-detection system: a
TypeScript SDK collects behavioral signal, a Spring Boot gateway enforces
policy, a FastAPI service scores it, and Postgres remembers what happened.

> Status: **Phase 0 of 8 — repository & tooling bootstrap.** See
> [`SPEC.md`](SPEC.md) for the full build plan and Definition of Done per phase.

## Architecture

```
User in Browser ──▶ SDK (TypeScript) ──▶ Java Gateway (Spring Boot) ──▶ Python ML Service (FastAPI)
                                             │                                  │
                                             └──────────▶ Postgres ◀────────────┘
```

- `frontend/packages/stealthguard-sdk` — telemetry SDK (Phase 4)
- `frontend/apps/demo` — demo login app wired to the gateway
- `java-gateway` — public REST surface, persistence, policy enforcement
- `ml-service` — feature scoring, training, explainability
- `db` — Postgres (sessions, telemetry, scores, decisions, model registry)

## Quick start

```bash
cp .env.example .env
make up          # build + start all four services
make smoke       # curl every service's /health
make logs        # follow the logs
```

- Gateway: http://localhost:8080/actuator/health
- ML service: http://localhost:8000/health
- Demo app: http://localhost:5173

`make demo` (up → seed → train) becomes the one-command path to a demo-ready
system in Phase 7.

## Repository layout

| Path | Contents |
|---|---|
| `frontend/` | npm workspace: `apps/*` and `packages/*` |
| `java-gateway/` | Spring Boot gateway (Maven) |
| `ml-service/` | FastAPI scoring service (Python) |
| `infra/` | SQL migrations and deployment assets |
| `docs/` | ADRs, API contracts, design documents |
| `scripts/` | smoke tests and dev tooling |

## Documentation

- Full spec: [`SPEC.md`](SPEC.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- Security/privacy framing: `PRIVACY.md` and `THREAT_MODEL.md` (later phases)
- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## License

MIT — see [`LICENSE`](LICENSE).