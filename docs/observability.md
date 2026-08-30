# Observability

Structured session-correlated logging and Prometheus/Grafana metrics for every
service (SPEC §5 Observability, Phase 8).

## Structured JSON logging

Both backends emit one JSON object per log line.

- **Gateway** — Logback JSON encoder (`logstash-logback-encoder`,
  `logback-spring.xml`). The telemetry path logs a `telemetry processed`
  record carrying structured fields: `session_id`, `latency_ms`, `decision`,
  `events`.
- **ML service** — a small JSON formatter (no external logger dependency).
  `/score` logs a `score` record with `session_id`, `latency_ms`, `score`,
  `model_version`.

Example gateway line:

```json
{"message":"telemetry processed","session_id":"6ed0c17d-…","latency_ms":323,
 "decision":"block","events":2}
```

## Metrics

| Service | Endpoint | Highlights |
|---|---|---|
| Gateway | `/actuator/prometheus` | `http_server_requests_seconds`, JVM memory/GC |
| ML service | `/metrics` | `http_requests_total`, `http_request_duration_seconds`, process |

Both are on the base stack, so `./scripts/smoke_test.sh` asserts them.

## Prometheus + Grafana overlay

Optional overlay (`docker-compose.observability.yml`):

```bash
make observability        # docker compose -f … -f docker-compose.observability.yml up -d
```

- **Prometheus** `:9090` — scrapes `java-gateway:8080/actuator/prometheus`
  and `ml-service:8000/metrics` every 5s.
- **Grafana** `:3000` (admin/admin) — auto-provisions a **StealthGuard**
  dashboard (`infra/grafana/provisioning/dashboards/stealthguard.json`) with
  request-rate and p95-latency panels for both services.

The dashboard JSON and datasource are file-provisioned, so a fresh Grafana
imports them with no manual steps.

## Notes

- The compose service is named `java-gateway` (hyphen): Docker DNS and
  Prometheus handle hyphens reliably, and it matches the other services.
- Metrics/overlay are stretch; they scrape the local stack only.