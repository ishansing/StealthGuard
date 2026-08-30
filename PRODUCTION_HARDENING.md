# Production Hardening Plan

> StealthGuard — on-prem VPS, ~100K req/day, GDPR-compliant internet-facing service.

---

## Assumptions

| Parameter | Value |
|---|---|
| Infrastructure | Single on-prem VPS (Docker Compose or later Kubernetes) |
| Traffic | ~100K requests/day (~1.15 avg req/s, burst ~10-20 req/s) |
| Compliance | GDPR (data minimisation, retention limits, right to erasure, privacy notice) |
| TLS | Termination at reverse proxy (Caddy or Traefik) |
| Database | PostgreSQL 16 on same VPS (adequate for this traffic) |

---

## Phase 1 — Reverse Proxy + TLS (Critical, Day 1)

**Goal:** Encrypt all traffic; block direct access to internal services.

| Task | Detail | Files |
|---|---|---|
| Add Caddy reverse proxy | TLS termination via Let's Encrypt; routes `/` → frontend, `/admin` → admin, `/api` → gateway; blocks direct access to ML service (8000), DB (5432) | `docker-compose.yml`, `Caddyfile` |
| Restrict exposed ports | Remove host bindings for DB, ML service, admin; gateway and frontend remain behind Caddy | `docker-compose.yml` |
| Security headers at proxy | Caddy adds `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`, `Referrer-Policy` | `Caddyfile` |
| Internal-only networking | Create `frontend-net` and `backend-net` Docker networks; DB + ML only reachable from gateway | `docker-compose.yml` |

**Verification:** `curl -I https://your-domain` shows HSTS + security headers; `curl http://localhost:8000` from outside VPS is refused.

---

## Phase 2 — Authentication + Rate Limiting (Critical, Day 2-3)

**Goal:** Protect admin endpoints; prevent abuse of telemetry endpoint.

| Task | Detail | Files |
|---|---|---|
| Admin API key auth | Middleware filter on `/stealthguard/admin/*`; key read from env var; 401 on missing/invalid key | `java-gateway/.../filter/AdminAuthFilter.java`, `AdminStatsController.java` |
| Admin dashboard auth | Caddy basic-auth on `/admin` path; hashed password from env | `Caddyfile` |
| Per-IP rate limiting on telemetry | Gateway filter: sliding window, configurable limit (default 60 req/min per IP), 429 on exceed | `java-gateway/.../filter/RateLimitFilter.java` |
| Per-session rate limiting | Max 30 telemetry POSTs per session per minute (bot amplification guard) | Same filter |
| HMAC enabled by default | Set `HMAC_ENABLED=true` in production config; reject unsigned telemetry in prod | `application.yml`, `HmacFilter.java` |
| Request body size limit | Set `spring.servlet.multipart.max-request-size=2MB` globally | `application.yml` |

**Verification:** `curl -X POST /stealthguard/admin/stats` without key → 401; rapid-fire telemetry → 429 after threshold.

---

## Phase 3 — Production Docker Images (High, Day 4-5)

**Goal:** Minimal, secure, reproducible images.

| Task | Detail | Files |
|---|---|---|
| Java gateway multi-stage | Build: `maven:3.9-eclipse-temurin-21` → Runtime: `eclipse-temurin:21-jre-alpine`; strip build tools | `java-gateway/Dockerfile` |
| ML service multi-stage | Build: `python:3.12-slim` + pip install → Runtime: `python:3.12-slim` without dev extras (pytest, ruff) | `ml-service/Dockerfile` |
| Frontend production build | Build: `oven/bun:1` + `bun run build` → Runtime: `nginx:alpine` serving static dist | `frontend/Dockerfile` |
| Admin production build | Same pattern as frontend; serve via nginx | `admin/Dockerfile` (new) |
| Add restart policies | `restart: unless-stopped` on all services | `docker-compose.yml` |
| Add resource limits | `deploy.resources.limits`: gateway 512MB/1 CPU, ML 1GB/2 CPU, frontend 128MB, admin 128MB, db 1GB/1 CPU | `docker-compose.yml` |
| Non-root containers | Each Dockerfile: `USER` directive for non-root execution | All Dockerfiles |
| Remove dev tools from prod images | No pytest, ruff, hypothesis, maven in final images | All Dockerfiles |

**Verification:** `docker images` shows <200MB per frontend/admin, <300MB per gateway/ML; `docker exec` as non-root succeeds.

---

## Phase 4 — Data Retention + GDPR (High, Day 6-8)

**Goal:** Enforce 7-day retention; implement right to erasure; publish privacy notice.

| Task | Detail | Files |
|---|---|---|
| Scheduled purge job | Spring `@Scheduled` method: delete telemetry + scores + decisions where `created_at < NOW() - INTERVAL '7 days'`; runs daily at 03:00 UTC | `java-gateway/.../service/RetentionPurgeService.java` |
| GDPR erasure endpoint | `DELETE /stealthguard/admin/sessions/{id}` — cascades to telemetry, scores, decisions; returns 204; logs erasure for audit | `SessionsController.java`, `SessionRepository.java` |
| Bulk erasure | `DELETE /stealthguard/admin/sessions?older_than=30d` — purge all sessions older than N days on demand | Same controller |
| Audit log for erasure | Log erasure events with timestamp, session IDs, requester (API key ID) — retained for 90 days separate from telemetry | `ErasureAuditLog` table + service |
| PRIVACY.md | Document: what data is collected, retention period, erasure rights, contact info, legal basis (legitimate interest) | `PRIVACY.md` |
| Data minimisation review | Remove any fields beyond what's needed for bot detection; ensure no PII leakage in scores/decisions | `TelemetryDto.java`, `FeaturesDto.java` |
| DB index on created_at | Add index on `telemetry_events.created_at` for efficient purge queries | New Flyway migration `V003__retention_index.sql` |

**Verification:** Insert test data >7 days old, trigger purge, confirm deletion; call erasure endpoint, confirm cascade delete; read PRIVACY.md for completeness.

---

## Phase 5 — Backups + Recovery (High, Day 9)

**Goal:** Survivable data loss; documented recovery procedure.

| Task | Detail | Files |
|---|---|---|
| Daily pg_dump cron | Shell script + cron on host: `pg_dump` to compressed file, rotated weekly, kept 30 days | `scripts/backup-db.sh`, host crontab |
| WAL archiving | Optional: configure `archive_mode=on` + `archive_command` for point-in-time recovery (PITR) | `docker-compose.yml` (db command args) |
| Backup verification | Weekly automated restore to a temp database + integrity check | `scripts/verify-backup.sh` |
| Recovery runbook | Step-by-step: restore from backup, verify data, restart services | `RUNBOOK.md` |
| Offsite backup | Copy backups to a second machine or encrypted cloud storage (e.g., `rclone` to S3-compatible) | `scripts/backup-db.sh` |

**Verification:** Simulate VPS failure: restore from backup on fresh machine, confirm data intact.

---

## Phase 6 — CI/CD Security (Medium, Day 10-12)

**Goal:** Detect vulnerabilities; produce versioned, signed images.

| Task | Detail | Files |
|---|---|---|
| Trivy container scan | CI step: scan each Docker image for CVEs; fail on HIGH/CRITICAL | `.github/workflows/ci.yml` |
| Dependency audit | `npm audit` (frontend), `pip-audit` (ML), Maven `dependency:check` (gateway) in CI | `.github/workflows/ci.yml` |
| Docker image build + push | CI builds tagged images, pushes to self-hosted registry (or GHCR) | `.github/workflows/ci.yml` |
| Secret scanning | Add gitleaks or trufflehog to CI; block pushes with secrets | `.github/workflows/ci.yml` |
| SBOM generation | `docker sbom` or `syft` produces SBOM per image; attach to release | `.github/workflows/ci.yml` |
| Path filtering | Only run relevant jobs on relevant file changes (e.g., `ml-service/**` only triggers ML job) | `.github/workflows/ci.yml` |

**Verification:** Introduce a known-vulnerable dependency → CI fails; push without secrets → clean scan.

---

## Phase 7 — Observability (Medium, Day 13-15)

**Goal:** See problems before users do; know what's happening across services.

| Task | Detail | Files |
|---|---|---|
| Distributed tracing (OpenTelemetry) | Instrument gateway + ML service with OTel SDK; export to Jaeger | `pom.xml`, `requirements.txt`, `docker-compose.observability.yml` |
| Structured log shipping | Deploy Loki + Promtail; collect container stdout logs centrally | `docker-compose.observability.yml`, `promtail-config.yml` |
| Alerting rules | Prometheus rules: error rate >1%, p95 latency >500ms, ML service down, DB connection pool exhausted | `infra/prometheus/rules.yml` |
| Alertmanager | Route alerts to email/Slack/webhook; group and deduplicate | `infra/alertmanager/alertmanager.yml`, `docker-compose.observability.yml` |
| Grafana persistence | Mount volume for Grafana data; provision dashboards from file | `docker-compose.observability.yml` |
| Prometheus persistence | Mount volume for Prometheus TSDB | `docker-compose.observability.yml` |
| Extended dashboard | Add panels: error rates, circuit breaker state, ML model accuracy/drag, DB pool usage, request queue depth | `infra/grafana/dashboards/stealthguard.json` |
| Health check lockdown | Change `show-details: always` → `show-details: when_authorized` | `application.yml` |

**Verification:** Trigger a slow ML response → Grafana shows latency spike + alert fires; restart gateway → logs appear in Loki.

---

## Phase 8 — Hardening + Tuning (Medium, Day 16-18)

**Goal:** Graceful under load; resilient to failures.

| Task | Detail | Files |
|---|---|---|
| DB connection pool tuning | HikariCP: `maximumPoolSize=20`, `connectionTimeout=5000ms`, `idleTimeout=300000ms`, `maxLifetime=1200000ms` | `application.yml` |
| CORS lockdown | Replace `*` with configurable allowed origins (env var `ALLOWED_ORIGINS`) | `CorsConfig.java` |
| CSRF protection | Add `SameSite=Strict` on session cookies; or CSRF token for admin forms | Gateway filter + frontend |
| Circuit breaker tuning | Tune Resilience4j for 100K/day: `slidingWindowSize=50`, `minimumNumberOfCalls=10` | `application.yml` |
| Graceful shutdown | Spring `server.shutdown=graceful`; FastAPI `--timeout-graceful-shutdown=30` | `application.yml`, `Dockerfile` |
| Graceful ML model reload | Replace `docker compose restart` with `/reload` endpoint that hot-loads new model without dropping requests | `ml-service/app/main.py` |
| Load testing | Run `k6` or `locust` at 2x expected peak (40 req/s sustained) for 10 minutes; verify no errors, p95 <200ms | `tests/load/` (new) |
| Environment separation | `.env.production` with non-dev passwords, production config | `.env.production.example` |

**Verification:** Run load test at 40 req/s for 10 min → p95 <200ms, no 5xx; kill ML service → circuit breaker opens, gateway returns `challenge` (not `allow`); restart ML → circuit breaker closes automatically.

---

## Execution Timeline

| Phase | Days | Dependencies |
|---|---|---|
| 1. Reverse Proxy + TLS | 1 | None |
| 2. Auth + Rate Limiting | 2-3 | Phase 1 (Caddy in place) |
| 3. Production Docker Images | 4-5 | None (can parallel with 1-2) |
| 4. Data Retention + GDPR | 6-8 | Phase 3 (production images) |
| 5. Backups + Recovery | 9 | Phase 4 (retention purge running) |
| 6. CI/CD Security | 10-12 | Phase 3 (Dockerfiles finalized) |
| 7. Observability | 13-15 | Phase 1 (internal networking) |
| 8. Hardening + Tuning | 16-18 | All prior phases |

**Total: ~18 working days** (phases 1-3 can overlap, phases 6-8 can overlap).

---

## Post-Deployment Checklist

- [ ] TLS active on public domain with valid certificate
- [ ] Admin dashboard requires authentication
- [ ] Telemetry endpoint rate-limited
- [ ] HMAC enforcement enabled
- [ ] All containers running as non-root with resource limits
- [ ] Data purge running daily, retention verified
- [ ] GDPR erasure endpoint tested end-to-end
- [ ] PRIVACY.md published on domain
- [ ] Daily backups running and verified
- [ ] CI scans passing (Trivy, dependency audit, secret scan)
- [ ] Monitoring dashboards showing live data
- [ ] Alerts configured and tested (fire a test alert)
- [ ] Load test passed at 2x peak traffic
- [ ] Recovery runbook reviewed and tested
