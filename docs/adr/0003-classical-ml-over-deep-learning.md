# ADR-0003: Classical ML over Deep Learning

- Status: Accepted
- Date: 2026-08-26

## Context

The MVP classifier must (a) work on small labeled datasets, (b) be
explainable out of the box, and (c) run cheaply on a local reference stack.
Deep sequence models (RNN/Transformer) over raw event streams promise richer
signal but need large datasets, GPU-class training, and produce opaque scores
that defeat the "explainable by default" signature feature (SPEC §3, §9.3).

## Decision

Use classical tabular ML over the engineered feature vector:

- **Logistic Regression** as the primary deployable — its coefficients give
  free, honest reason codes (`coefficient × standardized_feature_value`).
- **Random Forest** as the comparison candidate, selected by cross-validated
  AUC; LR wins near-ties so explainability stays coefficient-based.
- **Rule-based scorer** as the pre-training baseline (weighted z-score sum).

The feature vector (§9.2) is computed once, canonically, in
`ml-service/app/features.py` and kept in lockstep with the SDK's TypeScript
port via cross-language parity tests (Phase 4).

## Consequences

- Small training sets (synthetic, Phase 6) are sufficient; training is seconds,
  not hours.
- Every decision ships with top-3 human-readable reason codes.
- Sequence models remain a documented future upgrade path (SPEC §18); the
  feature vector is a stable contract they could later consume directly.