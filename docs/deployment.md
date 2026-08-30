# Deployment Guide

How to run StealthGuard persistently — beyond the one-off `make demo` — and
what to harden before trusting it with real traffic.

## Scope and posture

StealthGuard is a **local-sandbox reference build** (SPEC §1). It is:

- ✅ self-contained and offline-capable after `docker compose build`
- ✅ persistent (named volumes for Postgres and trained models)
- ❌ **not** production-hardened: no TLS, no auth on most endpoints, no
  multi-tenant isolation

Treat it as a demo/benchmark system or a starting point, not an internet-facing
service.

## Prerequisites

- Docker ≥ 25 with Compose v2
- ~4 GB free RAM
- 2–4 GB disk for images + volumes

## Setup

```bash
git clone <repo> && cd stealthguard
cp .env.example .env

# 1. Choose a real Postgres password
sed -i 's/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=<a-long-random-string>/' .env

# 2. Build and start
make up

# 3. Seed + train a model (recommended for a meaningful system)
make seed
make train
```

Everything is reachable on the same URLs as the demo (`:5173` demo, `:5174`
dashboard, `:8080` gateway, `:8000` ML, `:5432` Postgres).

## Configuration

Edit `.env` before first `make up`. The full list is documented in
[`.env.example`](../.env.example). Key items:

| Var | Default | Note |
|---|---|---|
| `POSTGRES_PASSWORD` | `stealthguard_dev` | **change this** |
| `HUMAN_ALLOW_THRESHOLD` / `BOT_BLOCK_THRESHOLD` | `0.8` / `0.4` | decision policy |
| `ML_SERVICE_URL` | `http://ml-service:8000` | internal, usually unchanged |
| `MODEL_VERSION_SHADOW` | unset | enable shadow scoring of a candidate model |
| `CHALLENGE_ANSWER` | `4` | expected answer for the fallback challenge |

## Persistence

- `pgdata` volume — the Postgres database. Back it up.
- `ml_models` volume — trained model artifacts (`model.pkl`,
  `metadata.json`, shadow versions). Survives container recreates.

### Backups

```bash
docker compose exec -T db pg_dump -U stealthguard stealthguard \
  > stealthguard-$(date +%F).sql
# restore
docker compose exec -T db psql -U stealthguard -d stealthguard < backup.sql
```

## Healthchecks and monitoring

Every service has a `healthcheck:`; `make smoke` asserts service health plus
the key API flows and metric endpoints. For dashboards:

```bash
make observability      # Prometheus :9090 + Grafana :3000 (admin/admin)
```

Change the Grafana admin password: set `GF_SECURITY_ADMIN_PASSWORD` in
`docker-compose.observability.yml`.

## Upgrades

```bash
git pull
make up                 # rebuilds changed images, keeps volumes
```

Schema migrations are Flyway versioned; they run automatically on gateway
boot, so the database upgrades with the code.

## Retraining and model promotion

```bash
make retrain            # fold feedback into training; write a shadow report
# review scripts/bot-sim/out/retrain-report.md, then promote v2 if it wins:
docker compose run --rm ml-service sh -c \
  "cp /app/models/model-v2.pkl /app/models/model.pkl && \
   cp /app/models/metadata-v2.json /app/models/metadata.json"
docker compose restart ml-service
```

See [`docs/tuning-loop.md`](docs/tuning-loop.md).

## Security hardening checklist

Before any non-local use:

- [ ] Set a strong `POSTGRES_PASSWORD` and change Grafana's default admin.
- [ ] Do **not** publish `db` (5432) to the host — remove its `ports:` entry;
      services reach it over the internal network.
- [ ] Put the gateway behind a reverse proxy with TLS if reachable from a
      network; terminate CORS at the proxy rather than the open
      `allowedOriginPatterns("*")` in `CorsConfig`.
- [ ] Enable/review the STRIDE notes in [`THREAT_MODEL.md`](../THREAT_MODEL.md).
- [ ] Raw-telemetry retention: SPEC §10 sets a 7-day default purge; the purge
      job is not implemented (stretch), so schedule one yourself (e.g.
      `DELETE FROM telemetry_events WHERE timestamp < now() - interval '7 days'`).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `make demo` bot sessions score `allow` | retrain with more data: `make seed` with extra `--human` sessions, then `make train` |
| ML service on `rule-based` after `make train` | the model wasn't written to the `ml_models` volume — run `make train` once more |
| Prometheus target `down` | service names use hyphens (`java-gateway`, `ml-service`); check `make observability` was used to start Prometheus |
| Everything broken | `make down && make demo` for a clean slate |