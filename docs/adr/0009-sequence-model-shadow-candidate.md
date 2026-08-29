# ADR-0009: Sequence-Model Shadow Candidate

- Status: Accepted
- Date: 2026-08-29

## Context

ADR-0003 chose classical tabular ML (logistic regression / random forest over
the engineered feature vector) over deep sequence models, partly because
explainability and small-data fit mattered more than raw capacity. Phase 9
(A3) revisits that with a lightweight sequence model (1D-CNN or small RNN)
over the raw event stream.

## Decision

The sequence model is trained and deployed **only as a shadow candidate**
(`model_version v2-seq`) via the §9.5 `MODEL_VERSION_SHADOW` mechanism: it
scores every request in parallel, writes to `scores` with `is_shadow=true`,
and never influences a decision. `scripts/compare_shadow.py` summarizes
agreement and disagreement cases against the active model.

It stays in shadow until evaluated against **real traffic**, not just the
synthetic simulator — because the simulator's own personas could silently
teach the sequence model the simulator's artifacts rather than real human
behavior. Promotion follows the manual, report-gated process documented in
`docs/tuning-loop.md`.

## Consequences

- Zero risk to real decisions while the candidate is being evaluated.
- The comparison report gives an evidence-based promotion path.
- Keep the feature vector contract intact: the tabular model remains the
  active deployable; the sequence model consumes the raw stream independently.