# ADR-0001: Record Architecture Decisions

- Status: Accepted
- Date: 2026-08-26

## Context

StealthGuard has a spec with many non-obvious design choices (feature parity
across languages, fail-safe policy, model selection, feature-computation
ownership, metrics stack). A "what" only codebase leaves reviewers guessing at
"why". Future phases (2–8) will each make at least one consequential call.

## Decision

Every non-obvious architectural choice is recorded as a Markdown Architecture
Decision Record in `docs/adr/NNNN-slug.md`, using the Nygard template (Status,
Context, Decision, Consequences). The running list is maintained in the
spec's Phase 15. ADRs are committed with the phase that makes the decision and
referenced from commit messages where relevant.

## Consequences

- Reviewers and future agents can reconstruct rationale without archaeology.
- Lightweight overhead: one short Markdown file per decision, no tooling.
- Risk that ADRs drift from the code is mitigated by making each phase's DoD
  checklist require its ADRs to be written/updated in the same commit as the
  code.