# ADR-0006: Metrics Stack Choice

- Status: Accepted
- Date: 2026-08-29

## Context

Phase 8 needs operational metrics (latency, request rates, JVM/process stats)
from a Java service and a Python service, scraped and visualized locally,
with no external cloud dependency (SPEC §5 Portability).

## Decision

- **Expose:** Micrometer with the Prometheus registry (`/actuator/prometheus`)
  on the gateway; `prometheus-fastapi-instrumentator` (`/metrics`) on the ML
  service. Both speak the Prometheus text format — one wire protocol, no
  translation layer.
- **Collect:** Prometheus scraping both endpoints every 5 s from a
  `docker-compose.observability.yml` overlay.
- **Visualize:** Grafana with file-provisioned datasource + dashboard so a
  fresh container imports cleanly with zero manual clicks.

Alternatives rejected: an ELK stack (heavy for two services), a SaaS APM
(contradicts the fully-local requirement), and hand-rolled JSON metrics
(duplicates what Micrometer/OpenMetrics already standardize).

## Consequences

- One scrape target per service; the dashboard and alert rules target the same
  PromQL.
- The observability stack is a separate overlay — the base `make up` stays
  uncluttered, and `make down` only affects the base stack.
- Prometheus/Grafana are additional image pulls for anyone who opts in; that
  is gated behind `make observability`.