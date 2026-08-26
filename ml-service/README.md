# StealthGuard ML Service (Python / FastAPI)

Scores behavioral telemetry for humanness and explains the decision (SPEC §8.2).
Feature engineering, scoring, explainability, and model training.

## Run

```bash
make up            # full stack; ML service on :8000
```

Directly (needs a Python 3.12 venv):

```bash
pip install -e '.[dev]'
uvicorn app.main:app --port 8000
```

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /score` | `{session_id, features}` → score, label, reason codes (§6.3) |
| `GET /health` | `{status, model_version, loaded_at}` |
| `GET /model/version` | Active + shadow model versions |

Before a model is trained, `/score` uses the deterministic `RuleBasedScorer`
(`model_version: "rule-based"`). Once `model.pkl` + `metadata.json` exist in
`MODEL_DIR`, the trained `MLScorer` takes over on the next startup.

## Training

```bash
python -m training.train --data sessions.csv --output-dir /app/models --version v1 [--register-db]
```

- Input: one row per raw event — `session_id,label,event_type,ts,key,down_time,up_time,x,y`
  (`label` is `human` or `bot`; the format matches what the bot simulator emits).
- Trains Logistic Regression + Random Forest, compares cross-validated AUC,
  deploys the winner, and always keeps LR coefficients for reason codes
  (Random Forest has no coefficients — §9.3 explainability needs them).
- Writes `model.pkl` (+ `explainer.pkl` if RF won) and `metadata.json`
  (version, metrics, feature list, standardization means/stds).
- With `--register-db`, upserts the model into the gateway's `model_registry`
  table (requires `DB_URL`).

## Test / lint

```bash
pytest --cov=app               # unit + property + training pipeline tests
ruff check app training tests
black --check app training tests
mypy app training
```

`make train` (Phase 6/7) drives training against seeded data.

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `MODEL_DIR` | `/app/models` | Where `model.pkl`/`metadata.json` live |
| `HUMAN_THRESHOLD` | `0.8` | Score ≥ this → `human` |
| `BOT_THRESHOLD` | `0.4` | Score ≤ this → `bot` |
| `MODEL_VERSION_SHADOW` | unset | Optional shadow model to score+log in parallel (§9.5) |
| `DB_URL` | unset | Postgres URL for `--register-db` |

## Security

Every `/score` request is scanned for PII-shaped keys (`email`, `phone`,
`aadhaar`, `name`, `password`, …) and rejected with `422` if found
(`app/pii.py`, SPEC §10).