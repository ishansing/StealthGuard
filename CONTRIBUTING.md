# Contributing

Thanks for contributing to StealthGuard! This is a local-sandbox reference
build of a privacy-first, passive bot-detection system. Read
[`SPEC.md`](SPEC.md) before starting; it is the source of truth.

## Workflow

- **Branches:** `phase-N/<short-slug>` (see §17 of the spec).
- **Commits:** Conventional Commits, each referencing its phase, e.g.
  `feat(ml-service): add explainable scoring [phase-2]`.
- **PRs:** fill in the Definition of Done checklist (§14 of the spec) before merge.
- **Definition of done for any phase:** code + tests green + lint clean + docs
  updated + manually verified against `make up` + conventional commit(s).

## Quick commands

- `make up` — build and start the whole stack
- `make test` — run every service's test suite
- `make lint` — run every service's linter
- `make down` — stop and wipe the local stack

## Standards

- `make lint` must be clean across all touched services before a phase is done.
- The SDK package version is semver-independent of the monorepo (§17).

See [`docs/`](docs/) for ADRs and design documents.