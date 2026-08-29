#!/usr/bin/env python3
"""Generate the StealthGuard shadow-trial deployment-confidence report (Phase 9 B1).

Runs against a completed trial window (TRIAL_MODE=log_only decisions persisted
with trial_mode=true) and produces a static HTML report answering the
procurement reviewer's question: "what happens if we turn this on?".

Usage (in the ml-service container; or host with ml-service deps installed):
    python scripts/generate_confidence_report.py \
        --db-url "$DB_URL" --ml-url http://ml-service:8000 \
        --gateway-url http://java-gateway:8080 \
        --window-hours 24 --out docs/reports/trial-$(date +%F).html
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make app.* (features, pii, accessibility) importable in container (/app) or repo.
for candidate in ("/app", str(Path(__file__).resolve().parents[1] / "ml-service")):
    if os.path.isdir(candidate):
        sys.path.insert(0, candidate)

import numpy as np  # noqa: E402

from app.accessibility import ACCESSIBILITY_PERSONAS  # noqa: E402
from app.features import compute_features  # noqa: E402
from app.pii import contains_pii  # noqa: E402

CSS = """
body{font-family:system-ui,sans-serif;max-width:72rem;margin:0 auto;padding:2rem 1.5rem;color:#111;line-height:1.5}
h1{font-size:1.6rem;margin-bottom:.2rem} .sub{color:#666;margin-top:0}
.banner{border-radius:8px;padding:.9rem 1.2rem;margin:1rem 0;font-weight:600}
.pass{background:#dcfce7;color:#14532d} .fail{background:#fee2e2;color:#7f1d1d}
section{margin:1.8rem 0} h2{font-size:1.15rem;border-bottom:1px solid #ddd;padding-bottom:.3rem}
.bar{background:#2563eb;color:#fff;padding:.25rem .5rem;border-radius:4px;margin:.15rem 0;min-width:2rem}
table{border-collapse:collapse;width:100%;font-size:.9rem} th,td{text-align:left;padding:.35rem .6rem;border-bottom:1px solid #eee}
.examples{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))}
.example{border:1px solid #ddd;border-radius:8px;padding:.7rem .9rem}
.metric{display:inline-block;margin:.2rem 1.2rem .2rem 0} .metric b{font-size:1.2rem}
code{background:#f5f5f5;padding:.1rem .3rem;border-radius:3px}
footer{margin-top:3rem;color:#888;font-size:.8rem}
"""


def _fmt_frac(counts: dict[str, int]) -> tuple[str, ...]:
    total = sum(counts.values()) or 1
    return tuple(f"{counts.get(k, 0)} ({counts.get(k, 0) / total:.0%})" for k in ("allow", "challenge", "block"))


def build_report(data: dict) -> tuple[str, bool]:
    """Render the report HTML from structured data. Returns (html, passed)."""
    traffic = data["traffic"]
    a11y = data["accessibility"]
    pii_flagged = data["pii_flagged"]
    passed = all(r["passed"] for r in a11y) and pii_flagged == 0

    allow, challenge, block = _fmt_frac(traffic)
    a11y_blocked = len(a11y) - sum(r["passed"] for r in a11y)
    a11y_statement = f"{a11y_blocked} of {len(a11y)} assistive-technology sessions would have been blocked."

    def _bar(label: str, count: int, total: int) -> str:
        pct = count / total if total else 0
        return f'<div class="bar" style="width:{max(pct * 100, 4):.0f}%">{label}: {count} ({pct:.0%})</div>'

    total = sum(traffic.values()) or 1
    reason_rows = "".join(
        f"<tr><td><code>{r['code']}</code></td><td>{r['count']}</td><td>{r['avg_weight']:.3f}</td></tr>"
        for r in data["top_reason_codes"]
    )
    a11y_rows = "".join(
        f"<tr><td>{r['persona']}</td><td>{r['decision'] or 'n/a'}</td>"
        f"<td>{r['score'] if r['score'] is not None else 'n/a'}</td>"
        f"<td>{'PASS' if r['passed'] else 'FAIL'}</td></tr>"
        for r in a11y
    )
    examples = "".join(
        f'<div class="example"><b>{e["session_id"][:8]}…</b> — {e["decision"]}<br/>'
        + ", ".join(f"<code>{rc['code']}</code>" for rc in e["reason_codes"])
        + "</div>"
        for e in data["examples"]
    )

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>StealthGuard trial report — {data['window_end']}</title>
<style>{CSS}</style></head><body>
<h1>StealthGuard — Shadow Trial Confidence Report</h1>
<p class="sub">Trial window: {data['window_start']} → {data['window_end']} · active model <code>{data['model_version']}</code></p>
<div class="banner {'pass' if passed else 'fail'}">
  {'PASS — this deployment is safe to turn on.' if passed else 'FAIL — review the flagged sections before enabling enforcement.'}
</div>
<section><h2>What would have happened</h2>
<p>Traffic breakdown (would-have-been decisions, log-only trial):</p>
{_bar('allow', traffic.get('allow', 0), total)}
{_bar('challenge', traffic.get('challenge', 0), total)}
{_bar('block', traffic.get('block', 0), total)}
<p>Allowed {allow} · Challenged {challenge} · Blocked {block}</p>
<h3>Top reason codes for challenged/blocked traffic</h3>
<table><thead><tr><th>Reason code</th><th>Sessions</th><th>Avg weight</th></tr></thead><tbody>{reason_rows}</tbody></table>
</section>
<section><h2>Accessibility stress test</h2>
<p><b>{a11y_statement}</b></p>
<table><thead><tr><th>Persona</th><th>Decision</th><th>Score</th><th>Result</th></tr></thead><tbody>{a11y_rows}</tbody></table>
</section>
<section><h2>Data minimization</h2>
<p>Automated PII scan of telemetry_events across the trial window:</p>
<p class="metric"><b>{pii_flagged}</b> PII-shaped fields found</p>
<p>{'Zero PII-shaped fields were ever stored.' if pii_flagged == 0 else 'PII-shaped fields were stored — investigate immediately.'}</p>
</section>
<section><h2>Example decisions (anonymized)</h2>
<p>Session IDs only; no raw coordinates or keystroke content.</p>
<div class="examples">{examples or '<p>No blocked/challenged sessions to show.</p>'}</div>
</section>
<section><h2>Latency & health</h2>
<p class="metric">mean ingest latency <b>{data['latency']['mean_ms']} ms</b></p>
<p class="metric">p95 ingest latency <b>{data['latency']['p95_ms']} ms</b></p>
<p class="metric">gateway <b>{data['services']['gateway']}</b></p>
<p class="metric">ml service <b>{data['services']['ml']}</b></p>
</section>
<footer>Generated by StealthGuard · SPEC Phase 9 B1 · <code>docs/reports/trial-…html</code></footer>
</body></html>"""
    return html, passed


def _reason_code_stats(rows: list[list]) -> list[dict]:
    """Aggregate reason_codes from scores into code -> {count, avg_weight}."""
    from collections import defaultdict

    acc: dict[str, list[float]] = defaultdict(list)
    for (reason_codes,) in rows:
        for rc in reason_codes or []:
            acc[rc.get("code", "?")].append(float(rc.get("weight", 0.0)))
    ranked = sorted(acc.items(), key=lambda kv: -len(kv[1]))[:8]
    return [{"code": c, "count": len(w), "avg_weight": float(np.mean(w))} for c, w in ranked]


def fetch_trial_data(db_url: str, window_hours: int) -> dict:
    import psycopg

    window_start = datetime.now(timezone.utc).timestamp() - window_hours * 3600
    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT decision, COUNT(*) FROM decisions WHERE trial_mode = true "
            "AND created_at >= to_timestamp(%s) GROUP BY decision",
            (window_start,),
        )
        traffic = {row[0]: row[1] for row in cur.fetchall()}

        cur.execute(
            "SELECT s.reason_codes FROM scores s JOIN decisions d ON d.session_id = s.session_id "
            "WHERE d.trial_mode = true AND d.decision IN ('challenge','block') "
            "AND d.created_at >= to_timestamp(%s)",
            (window_start,),
        )
        reason_rows = cur.fetchall()
        top_reason_codes = _reason_code_stats(reason_rows)

        cur.execute(
            "SELECT d.session_id, d.decision, s.reason_codes FROM decisions d "
            "JOIN scores s ON s.session_id = d.session_id "
            "WHERE d.trial_mode = true AND d.decision IN ('challenge','block') "
            "AND d.created_at >= to_timestamp(%s) ORDER BY d.created_at DESC LIMIT 5",
            (window_start,),
        )
        examples = [
            {"session_id": str(sid), "decision": decision, "reason_codes": rc or []}
            for sid, decision, rc in cur.fetchall()
        ]

        cur.execute(
            "SELECT latency_ms FROM decisions WHERE trial_mode = true "
            "AND latency_ms IS NOT NULL AND created_at >= to_timestamp(%s)",
            (window_start,),
        )
        latencies = [row[0] for row in cur.fetchall()]
        cur.execute(
            "SELECT payload FROM telemetry_events WHERE timestamp >= to_timestamp(%s)",
            (window_start,),
        )
        payloads = [row[0] for row in cur.fetchall()]

    pii_flagged = sum(1 for p in payloads if contains_pii(p or {}))
    lat = np.array(latencies, dtype=float)
    return {
        "traffic": traffic,
        "top_reason_codes": top_reason_codes,
        "examples": examples,
        "pii_flagged": pii_flagged,
        "latency": {
            "mean_ms": round(float(lat.mean())) if len(lat) else 0,
            "p95_ms": round(float(np.percentile(lat, 95))) if len(lat) else 0,
        },
    }


def _post_json(url: str, payload: dict, timeout: float = 10) -> dict:
    import urllib.request

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def score_accessibility(ml_url: str) -> list[dict]:
    results = []
    for name, telemetry in ACCESSIBILITY_PERSONAS.items():
        features = compute_features(telemetry)
        try:
            body = _post_json(f"{ml_url}/score", {"session_id": f"a11y-{name}", "features": features})
            label = body.get("label")
            score = body.get("humanness_score")
        except Exception:
            label, score = None, None
        results.append({"persona": name, "decision": label, "score": score, "passed": label != "bot"})
    return results


def check_health(url: str) -> str:
    import urllib.request

    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return "UP" if resp.status < 400 else "DOWN"
    except Exception:
        return "DOWN"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the shadow-trial confidence report")
    parser.add_argument("--db-url", default=os.environ.get("DB_URL"))
    parser.add_argument("--ml-url", default="http://ml-service:8000")
    parser.add_argument("--gateway-url", default="http://java-gateway:8080")
    parser.add_argument("--window-hours", type=int, default=24)
    parser.add_argument("--out", default=None, help="output HTML path (default docs/reports/trial-<date>.html)")
    args = parser.parse_args()
    if not args.db_url:
        raise SystemExit("DB_URL is required (set --db-url or DB_URL)")

    data = fetch_trial_data(args.db_url, args.window_hours)
    data["accessibility"] = score_accessibility(args.ml_url)
    data["services"] = {
        "gateway": check_health(f"{args.gateway_url}/actuator/health"),
        "ml": check_health(f"{args.ml_url}/health"),
    }
    data["window_end"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data["window_start"] = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() - args.window_hours * 3600, tz=timezone.utc
    ).isoformat(timespec="seconds")

    # active model version (from the ml service health)
    import urllib.request

    try:
        with urllib.request.urlopen(f"{args.ml_url}/health", timeout=5) as resp:
            data["model_version"] = json.loads(resp.read().decode()).get("model_version", "?")
    except Exception:
        data["model_version"] = "?"

    out = args.out or f"docs/reports/trial-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.html"
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    html, passed = build_report(data)
    Path(out).write_text(html)

    allow, challenge, block = _fmt_frac(data["traffic"])
    print(
        f"[StealthGuard trial] allow {allow} | challenge {challenge} | block {block} "
        f"| accessibility {'PASS' if passed else 'FAIL'} | PII {data['pii_flagged']} "
        f"| latency p95 {data['latency']['p95_ms']}ms | report -> {out}"
    )
    if not passed:
        raise SystemExit("Report FAILED: accessibility persona blocked or PII found.")


if __name__ == "__main__":
    main()