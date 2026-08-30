# Tuning Loop

How StealthGuard models get corrected and improved over time — reviewer
feedback feeds retraining, and new models are validated as shadows before
promotion (SPEC §9.5/§9.6, Phase 8).

## The loop

```
real users → gateway → scores/decisions
     │
     ▼
analyst dashboard ── "Mark as human/bot" ──▶ feedback table
     │
     ▼
make retrain ── folds feedback into the training set, trains v2 (shadow),
                writes a comparison report
     │
     ▼
review report → promote v2 to active (copy model-v2.pkl → model.pkl) + restart
```

## Folding feedback in

`make retrain` runs `scripts/retrain_from_feedback.py`:

1. Reads `feedback` rows (session_id, corrected_label) from Postgres.
2. Pulls each corrected session's raw `telemetry_events` and recomputes its
   features with the canonical `features.py`.
3. Appends them to the seed CSV → `sessions-augmented.csv`.
4. Trains a candidate `v2` on a stratified holdout split and saves it as the
   **shadow** artifact (`model-v2.pkl`, `metadata-v2.json`).
5. Compares active `v1` vs shadow `v2` on the holdout — accuracy per class and
   agreement rate — and writes `retrain-report.md`.

## Shadow mode

The ML service loads a shadow model when `MODEL_VERSION_SHADOW` is set (e.g.
`=v2`); it scores every request in parallel, logs the result, and **never**
affects the returned decision (§9.5). `GET /model/version` reports active +
shadow.

## Promoting

When the report shows the shadow outperforming the active model:

```bash
# in the ml_models volume
docker compose run --rm ml-service sh -c \
  "cp /app/models/model-v2.pkl /app/models/model.pkl && \
   cp /app/models/metadata-v2.json /app/models/metadata.json && \
   cp /app/models/explainer-v2.pkl /app/models/explainer.pkl 2>/dev/null; true"
docker compose restart ml-service
```

A deliberately manual step: promotion is a human decision, not an automatic one.

## Monitoring the loop

- Gateway and ML metrics (request rate, p95 latency) in Grafana
  (`make observability`) confirm the retrained model isn't hurting serving
  latency.
- Structured logs carry `session_id` + `latency_ms`, so any slow scoring is
  traceable to a session.