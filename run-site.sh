#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  printf 'Error: npm is required to run the website.\n' >&2
  exit 1
fi

printf 'Starting the website at http://localhost:8080\n'
exec npm run dev:full
