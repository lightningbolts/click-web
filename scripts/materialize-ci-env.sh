#!/usr/bin/env bash
# Copy `.env.example` to `.env` / `.env.production` so Next and OpenNext see
# every documented variable. Overlay non-empty process env (GitHub secrets).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [ ! -f .env.example ]; then
  echo "missing .env.example" >&2
  exit 1
fi

cp .env.example .env
cp .env.example .env.production

keys=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  NEXT_PUBLIC_BASE_URL
  NEXT_PUBLIC_APP_LAUNCHED
  NEXT_PUBLIC_IOS_STORE_URL
  NEXT_PUBLIC_ANDROID_STORE_URL
  NEXT_PUBLIC_IOS_APP_ID
  SUPABASE_SERVICE_ROLE_KEY
  CRON_SECRET
  LIVEKIT_API_KEY
  LIVEKIT_API_SECRET
  LIVEKIT_WS_URL
  LIVEKIT_URL
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_ID
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  ENRICHMENT_WEBHOOK_SECRET
  TICKETMASTER_API_KEY
  BUSINESS_INSIGHTS_DEV_EMAILS
)

overlay_file() {
  local file="$1"
  local key="$2"
  local value="$3"
  python3 - "$file" "$key" "$value" <<'PY'
import pathlib, sys
path, key, value = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines = path.read_text().splitlines()
out = []
found = False
for line in lines:
    if line.startswith(f"{key}="):
        out.append(f"{key}={value}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"{key}={value}")
path.write_text("\n".join(out) + "\n")
PY
}

echo "Build env presence (values never printed):"
for key in "${keys[@]}"; do
  val="${!key:-}"
  if [ -n "$val" ]; then
    overlay_file .env "$key" "$val"
    overlay_file .env.production "$key" "$val"
    echo "  $key=set"
  else
    echo "  $key=example/default"
  fi
done

if [ -n "${GITHUB_ENV:-}" ]; then
  python3 - <<'PY'
import os
from pathlib import Path
env_file = os.environ["GITHUB_ENV"]
with open(env_file, "a", encoding="utf-8") as out:
    for line in Path(".env").read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, _, value = stripped.partition("=")
        out.write(f"{key}<<ENV_EOF\n{value}\nENV_EOF\n")
PY
fi
