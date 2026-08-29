# ML Design

Reference design for StealthGuard's bot-detection scoring. Canonical
implementation: `ml-service/app/features.py` (this module is the single source
of truth the SDK's TypeScript port must match — see Phase 4 parity tests).

## Feature vector (§9.2 + Phase 9 A1/A5)

Twenty-one features derived from raw telemetry (SPEC §6.2 shape, plus the
privacy-safe `signals` block from Phase 9 A5 — precomputed counts and input
modality only, never raw content):

| Feature | Formula | Rationale |
|---|---|---|
| `keystroke_mean_hold_ms` | mean `(up_time − down_time) × 1000` | human typing baseline |
| `keystroke_std_hold_ms` | population std of hold times | humans vary; bots don't |
| `keystroke_mean_interkey_ms` | mean press-to-press interval × 1000 | typing pace |
| `keystroke_std_interkey_ms` | population std of press-to-press intervals | rhythmic uniformity = bot |
| `typing_speed_chars_per_s` | keystroke count ÷ session duration | bots type at extreme rates |
| `mouse_mean_speed_px_per_s` | mean segment speed (`dist / dt`) | pointer pace |
| `mouse_std_speed_px_per_s` | population std of segment speeds | constant speed = bot |
| `mouse_path_efficiency` | straight-line distance ÷ total path length | straight paths = bot |
| `mouse_idle_ratio` | 1 − active-time ÷ duration | humans pause |
| `mouse_direction_changes` | count of consecutive segments diverging > 45° | humans zigzag |
| `session_duration_ms` | (max − min) event timestamp × 1000 | bots finish instantly |
| `event_count` | total keystrokes + moves + clicks | event volume |
| `fitts_fit_error_ms` | RMSE of `T = a + b·log2(D/W + 1)` over click approaches (W = assumed 30 px target) | humans follow the Fitts speed–accuracy tradeoff; constant-speed bots don't |
| `arrival_to_click_latency_ms` | mean time from entering the target radius to the click | humans settle before clicking |
| `micro_tremor_px_per_s2` | mean magnitude of the second finite difference of pointer position | a smooth path with no tremor is a bot tell |
| `digraph_mean_latency_ms` | mean latency across the top-5 most frequent key-pair digraphs | digraph timing is a keystroke-dynamics staple |
| `digraph_std_latency_ms` | population std across those digraphs | pair-specific variance is human |
| `paste_event_count` | count of paste events (`signals.paste_events`) | pasting is natural, privacy-safe input |
| `keyless_fill_count` | count of focused fields filled with zero keydowns (`signals.keyless_fills`) | autofill/assistive fill detection |
| `input_modality` | `mouse=0, keyboard=1, touch=2, switch=3` | drives per-modality thresholds (A5) |
| `keystroke_share` | keystrokes ÷ total events | keyboard-centric (e.g. screen-reader) use |

Fitts's law and arrival-to-click use an **assumed 30 px target width** because
DOM geometry is not in the telemetry; a production integration would supply
real target geometry. All outputs are finite; empty/malformed input → zeros.

Edge-case rules (guarded so every output is finite; empty/malformed input → zeros):
- Segments closer than 1 ms carry no velocity (real telemetry has ms precision).
- Sessions spanning < 1 µs are treated as zero-duration.
- Paths shorter than 1e-9 px have undefined efficiency → 0.0.

## Models (§9.1)

- **Baseline:** `RuleBasedScorer` — deterministic weighted z-score sum against a
  human baseline centered on the SPEC §6.3 example vector, squashed through a
  sigmoid. Proves the pipeline before any model exists; `model_version:
  "rule-based"`.
- **MVP:** Logistic Regression on standardized features. Chosen because its
  coefficients give free, honest explainability (§9.3).
- **Comparison candidate:** Random Forest, tracked via cross-validated AUC.
- **Selection:** train both, compare CV AUC; deploy the winner. LR always wins
  on near-ties (margin 0.02) to keep reason codes coefficient-based; if RF wins,
  LR coefficients are kept in `explainer.pkl` purely for explanation.
- **Future (documented, not built):** sequence models over raw event streams
  (see ADR 0003 and SPEC §18).

Standardization: features are z-scored against training means/stds (stored in
`metadata.json`) before prediction and before coefficient×z explainability.

## Explainability (§9.3)

Each feature's contribution is `coefficient × standardized_value` (rule-based:
`weight × direction × z`). The top 3 by |contribution| are returned as reason
codes, mapped through a human-readable dictionary (`LABEL_DICT` in
`app/scorer.py`), e.g.:

- `keystroke_std_hold_ms` low → `uniform_keystroke_rhythm`
- `mouse_path_efficiency` high → `linear_mouse_path`
- `mouse_direction_changes` low → `straight_line_mouse_path`

Weights in the response are the raw |contribution| values (not normalized).

## Labels & thresholds (§8.1/§9.4)

`score ≥ 0.8 → human`, `score ≤ 0.4 → bot`, else `uncertain`. Thresholds come
from env (`HUMAN_THRESHOLD` / `BOT_THRESHOLD`), never hardcoded. The gateway
maps these to `allow` / `block` / `challenge`.

## Evaluation (§9.4)

`training.train` records `lr_cv_auc`, `rf_cv_auc`, and train accuracy in
`metadata.json`, and (with `--register-db`) upserts them into
`model_registry.metrics_json`. Aspirational target: >90% accuracy on the
held-out synthetic set (Phase 6).

## Shadow mode (§9.5)

If `MODEL_VERSION_SHADOW` is set, a second model is loaded from
`model-<version>.pkl` / `metadata-<version>.json` and scores every request in
parallel — logged only, never affecting the response.

## Privacy (§10)

`/score` rejects PII-shaped request keys with `422` (`app/pii.py`). The feature
vector contains no coordinates or keystroke values — only aggregates.