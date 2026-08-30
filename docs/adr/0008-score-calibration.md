# ADR-0008: Score Calibration

- Status: Accepted
- Date: 2026-08-29

## Context

`humanness_score` currently comes straight from the model (logistic
probability for the active model; a sigmoid of a weighted z-sum for the
baseline). A threshold of `0.8` therefore means "logit/raw output ≥ 0.8",
which is not comparable across retrains or across model architectures (a
Random Forest's probability estimate differs in calibration from a logistic
regression's).

## Decision

Insert a calibration step between the raw model output and
`humanness_score`, fitted with `sklearn.calibration.CalibratedClassifierCV`
(Platt scaling; isotonic as a fallback if it performs better). The calibration
curve and parameters are stored in `model_registry.metadata_json` and the ML
service's `metadata.json`, so every version records how its scores were
calibrated.

Thresholds stay at §8.1 (`0.8`/`0.4`), but now they denote calibrated
confidence: `0.8` means "≈80% of sessions scored 0.8 are genuinely human",
stable across retrains and versions.

## Consequences

- Scores become comparable across model versions — required for the shadow
  comparison report (A3/B1) and for threshold tuning.
- Calibration needs a held-out fit fold, so training reserves a stratified
  calibration set.
- The rule-based baseline is exempt (it is not a probability model); it keeps
  its heuristic sigmoid but is clearly documented as uncalibrated.