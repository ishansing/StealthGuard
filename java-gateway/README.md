# StealthGuard Gateway (Java / Spring Boot)

Public REST surface, persistence, policy enforcement, and resilience. See
[`SPEC.md`](../SPEC.md) §8.1 for the API contracts and [`docs/data-model.md`](../docs/data-model.md)
for the schema.

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
./mvnw test                # unit + Testcontainers-backed repository tests
./mvnw checkstyle:check    # lint
```

Repository and schema tests boot a real `postgres:16-alpine` via Testcontainers
(see `AbstractPostgresTest`). They require Docker >= 25 — the suite forces the
Docker API version to `1.44` in `maven-surefire-plugin` because Testcontainers
1.21.x hardcodes `1.32`, which Docker >= 29 rejects.

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
| `HUMAN_ALLOW_THRESHOLD` / `BOT_BLOCK_THRESHOLD` | `0.8` / `0.4` | Decision policy |
| `HMAC_ENABLED` | `false` | Telemetry signing toggle (Stretch) |
| `MAX_EVENTS_PER_ARRAY` | `5000` | Telemetry abuse guard |
