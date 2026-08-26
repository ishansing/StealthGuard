#!/usr/bin/env bash
# Smoke test: assert every service's health endpoint returns HTTP 200.
# Reused and expanded in Phase 7.
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
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)
  if [ "$code" = "200" ]; then
    echo "OK   $name ($url)"
  else
    echo "FAIL $name ($url) -> HTTP ${code:-no response}"
    exit 1
  fi
}

check "ml_service"   http://localhost:8000/health
check "java_gateway" http://localhost:8080/actuator/health
check "frontend"     http://localhost:5173/

if docker compose exec -T db pg_isready -U "$PGUSER" -d "$PGDB" >/dev/null 2>&1; then
  echo "OK   db (pg_isready)"
else
  echo "FAIL db (pg_isready)"
  exit 1
fi

echo "All services healthy."