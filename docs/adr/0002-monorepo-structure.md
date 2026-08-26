# ADR-0002: Monorepo Structure

- Status: Accepted
- Date: 2026-08-26

## Context

StealthGuard has three polyglot services (TypeScript frontend, Java gateway,
Python ML service) that must ship together as a demoable whole, share fixture
data for cross-language parity tests, and be developed against a single
compose stack. The alternative — separate repositories per service — adds
cross-repo versioning overhead and makes the parity fixtures hard to keep in
lockstep.

## Decision

Use a single Git repository with a directory per service:

- `frontend/` — npm/bun workspace: `apps/*` (demo, later admin) and
  `packages/*` (the `stealthguard-sdk`).
- `java-gateway/` — Spring Boot Maven project, independently buildable.
- `ml-service/` — FastAPI project, independently testable.
- `infra/` — SQL migrations and deployment assets.
- `docs/` — ADRs, exported API contracts, design docs.
- `scripts/` — smoke tests and dev tooling.

Each service owns its build and test tooling and must be buildable/testable
independently of the others (`make test` runs them in sequence but nothing
shares compiled artifacts). Shared fixtures land in `/fixtures` when Phase 4
introduces the parity tests.

## Consequences

- One `make up` builds the whole stack; cross-service changes land in one PR.
- CI can run each service's suite as a separate job (no shared artifacts).
- The monorepo is mixed-language, but each subtree stays idiomatic to its
  ecosystem rather than forcing one toolchain everywhere.