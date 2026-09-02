#!/usr/bin/env bash
# Guardrail: forbid bespoke interactive elements outside frontend/packages/ui.
# A new <button> or role="button" anywhere in apps/packages (except ui) means the
# shared primitives were bypassed. Hard stop, not a warning.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIOLATIONS="$(cd "$ROOT" && rg -n --pcre2 --glob '*.{ts,tsx}' \
  --glob '!packages/ui/**' \
  '(<button\b|role="button")' \
  apps packages || true)"

if [[ -n "$VIOLATIONS" ]]; then
  echo "error: bespoke interactive element outside frontend/packages/ui:" >&2
  echo "$VIOLATIONS" >&2
  echo "Use Button / IconButton / LinkButton from @stealthguard/ui instead. See AGENT_GUIDELINES.md." >&2
  exit 1
fi

echo "ok: no bespoke buttons outside packages/ui"