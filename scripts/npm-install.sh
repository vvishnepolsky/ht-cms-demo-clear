#!/usr/bin/env bash
# Serialized `npm install` for the workspace root. Several agents/terminals may
# edit package.json files concurrently; this mkdir-based lock makes sure only one
# install rewrites package-lock.json at a time. Usage: scripts/npm-install.sh [npm install args]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$ROOT/.install.lock"
for _ in $(seq 1 600); do
  if mkdir "$LOCK" 2>/dev/null; then
    trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
    cd "$ROOT" && npm install --no-audit --no-fund "$@"
    exit $?
  fi
  sleep 2
done
echo "npm-install.sh: timed out waiting for lock $LOCK" >&2; exit 1
