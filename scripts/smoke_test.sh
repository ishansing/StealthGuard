#!/usr/bin/env bash
# Smoke test: assert every service's health endpoint returns HTTP 200.
# Retries each check for up to ~30s so a service restarting between steps
# (e.g. `make train` restarts ml-service) doesn't cause a false failure.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PGUSER="${POSTGRES_USER:-stealthguard}"
PGDB="${POSTGRES_DB:-stealthguard}"

check() {
  local name="$1" url="$2"
  local code=""
  for _ in $(seq 1 10); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)
    if [ "$code" = "200" ]; then
      echo "OK   $name ($url)"
      return 0
    fi
    sleep 3
  done
  echo "FAIL $name ($url) -> HTTP ${code:-no response}"
  exit 1
}

check "ml_service"   http://localhost:8000/health
check "java_gateway" http://localhost:8080/actuator/health
check "frontend"     http://localhost:5173/
check "admin"        http://localhost:5174/

if docker compose exec -T db pg_isready -U "$PGUSER" -d "$PGDB" >/dev/null 2>&1; then
  echo "OK   db (pg_isready)"
else
  echo "FAIL db (pg_isready)"
  exit 1
fi

# --- API-level checks ---
SID=$(curl -s -X POST http://localhost:8080/stealthguard/session/init \
  -H 'Content-Type: application/json' -d '{"page":"/smoke"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['session_id'])" 2>/dev/null || true)

if [ -n "$SID" ]; then
  echo "OK   session/init (issued $SID)"
else
  echo "FAIL session/init"
  exit 1
fi

DEC=$(curl -s -X POST http://localhost:8080/stealthguard/telemetry \
  -H 'Content-Type: application/json' \
  -d "{\"session_id\":\"$SID\",\"page\":\"/smoke\",\"keystrokes\":[{\"key\":\"a\",\"down_time\":1.0,\"up_time\":1.08},{\"key\":\"b\",\"down_time\":1.08,\"up_time\":1.16},{\"key\":\"c\",\"down_time\":1.16,\"up_time\":1.24}],\"mouse_moves\":[{\"x\":0,\"y\":0,\"t\":1.0},{\"x\":10,\"y\":10,\"t\":1.05},{\"x\":20,\"y\":20,\"t\":1.1}]}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('decision',''))" 2>/dev/null || true)

case "$DEC" in
  allow|block|challenge) echo "OK   telemetry → decision ($DEC)" ;;
  *) echo "FAIL telemetry → decision (got: ${DEC:-none})"; exit 1 ;;
esac

curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/stealthguard/admin/stats | grep -q 200 \
  && echo "OK   admin/stats" || { echo "FAIL admin/stats"; exit 1; }

curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/score \
  -X POST -H 'Content-Type: application/json' \
  -d '{"session_id":"x","features":{"keystroke_std_hold_ms":1.0}}' | grep -q 200 \
  && echo "OK   ml /score" || { echo "FAIL ml /score"; exit 1; }

# --- metrics endpoints (Phase 8) ---
curl -s http://localhost:8080/actuator/prometheus | grep -q "http_server_requests_seconds" \
  && echo "OK   gateway /actuator/prometheus" || { echo "FAIL gateway prometheus"; exit 1; }

curl -s http://localhost:8000/metrics | grep -q "http_requests_total" \
  && echo "OK   ml /metrics" || { echo "FAIL ml metrics"; exit 1; }

echo "All services healthy."