#!/usr/bin/env bash
# Create `.env` / `.env.production` from `.env.example` in CI (GitHub Actions
# and Cloudflare Workers Builds). Local `npm install` is a no-op.
set -euo pipefail

if [ -z "${CI:-}" ] && [ -z "${WORKERS_CI:-}" ]; then
  exit 0
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$root/scripts/materialize-ci-env.sh"
