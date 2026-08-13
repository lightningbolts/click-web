#!/usr/bin/env bash
# Cloudflare Workers Builds sets WORKERS_CI=1 and typically runs `npm run build`.
# That must produce `.open-next/worker.js`. GitHub `lint-test-build` should stay
# on `next build` (OpenNext is covered by the `build-worker` job).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [ -n "${WORKERS_CI:-}" ]; then
  bash scripts/materialize-ci-env.sh
  exec npx opennextjs-cloudflare build
fi

exec npx next build
