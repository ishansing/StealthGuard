# StealthGuard Gateway (Java / Spring Boot)

Public REST surface, persistence, policy enforcement, and resilience. See
[`SPEC.md`](../SPEC.md) §8.1 for the API contracts and [`docs/data-model.md`](../docs/data-model.md)
for the schema.

## Endpoints (SPEC §8.1)

| Endpoint | Method | Purpose |
|---|---|---|
| `/stealthguard/session/init` | POST | Issue a `session_id` |
| `/stealthguard/telemetry` | POST | Ingest telemetry, score, return a decision |
| `/stealthguard/decision/{sessionId}` | GET | Latest decision for a session |
| `/stealthguard/challenge/{sessionId}/respond` | POST | Record a fallback-challenge answer; may upgrade to `allow` |
| `/stealthguard/admin/sessions` | GET | Paginated sessions (dashboard) |
| `/stealthguard/admin/stats` | GET | Decision + label counts |
| `/actuator/health` | GET | Liveness/readiness |
| `/swagger-ui.html` | GET | OpenAPI UI (springdoc) |

Decision policy: `score >= 0.8 → allow`, `score <= 0.4 → block`, else
`challenge`; any ML-service failure degrades to `challenge` (ADR 0005).

## Run

```bash
make up            # builds and starts the full stack; gateway on :8080
```

Directly (needs Postgres reachable via `DB_URL`):

```bash
./mvnw spring-boot:run
```

## Test

```bash
./mvnw test                # unit + Testcontainers-backed tests (WireMock stubs ML)
./mvnw checkstyle:check    # lint
```

`make test` runs the gateway's suite via `docker compose run` with the host
Docker socket mounted so Testcontainers can spawn Postgres. Repository and
integration tests require Docker >= 25 (see the `-Dapi.version=1.44` surefire
note below).

## Database

Flyway migrates the schema automatically on boot. Migrations are the single
source of truth in [`infra/sql/`](../infra/sql) and are copied onto the classpath
(`db/migration`) at build time by `maven-resources-plugin`.

- Schema: 7 tables — `sessions`, `telemetry_events`, `model_registry`, `scores`,
  `decisions`, `feedback`, `challenge_responses` (see `docs/data-model.md`).
- JPA entities: `org.stealthguard.gateway.model`.
- Repositories: `org.stealthguard.gateway.repository`.

Key env vars (documented in `.env.example`):

| Var | Default | Purpose |
|---|---|---|
| `DB_URL` | `jdbc:postgresql://db:5432/stealthguard` | Datasource |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | `stealthguard` / `stealthguard_dev` | Credentials |
| `ML_SERVICE_URL` | `http://ml_service:8000` | ML service base URL |
| `ML_TIMEOUT` | `2s` | Per-call ML timeout |
| `HUMAN_ALLOW_THRESHOLD` / `BOT_BLOCK_THRESHOLD` | `0.8` / `0.4` | Decision policy |
| `HMAC_ENABLED` | `false` | Telemetry signing toggle (Stretch) |
| `MAX_EVENTS_PER_ARRAY` | `5000` | Telemetry abuse guard |
| `CHALLENGE_ANSWER` | `4` | Server-side answer for the fallback challenge |

## Security

- Runtime PII-shape guard rejects PII-shaped JSON keys on `/telemetry` with
  `422` before anything is persisted (`web/PiiFilter`, SPEC §10).
- The ML client (WebClient) has a timeout, one retry, and a Resilience4j
  circuit breaker; any failure degrades to `challenge`, never `allow`
  (ADR 0005).
- All errors share the `{error, message, sessionId}` shape (§8.1) via
  `web/GlobalExceptionHandler`.

## Notes

- Feature computation is delegated to the ML service (`/features`), keeping
  `app/features.py` the single source of truth (ADR 0004).
- The test suite forces Docker API version `1.44` in `maven-surefire-plugin`
  because Testcontainers 1.21.x hardcodes `1.32`, rejected by Docker >= 29.
