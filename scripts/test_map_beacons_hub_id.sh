#!/usr/bin/env bash
# Event-hub migration contract check used by CI and mobile drift validation.
# Pass --live to run the transactional catalog/DML assertions against a linked
# database; pass --apply to apply click-web's tracked migrations first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINK_MIGRATION="$ROOT/supabase/migrations/20260901200000_map_beacons_hub_id.sql"
SECURITY_MIGRATION="$ROOT/supabase/migrations/20260901300000_event_hub_security_reconciliation.sql"
SQL="$ROOT/scripts/test_map_beacons_hub_id.sql"
LIVE=false
APPLY=false
DB_URL="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

usage() {
  cat <<'EOF'
Usage: scripts/test_map_beacons_hub_id.sh [--live] [--apply] [--db-url URL]

  --live       Run scripts/test_map_beacons_hub_id.sql against a database.
  --apply      Apply click-web's tracked migrations before the live checks.
  --db-url     Postgres URI (else SUPABASE_DB_URL or DATABASE_URL).

The default mode is dependency-free and checks the source migration contract.
EOF
}

while (($# > 0)); do
  case "$1" in
    --live) LIVE=true ;;
    --apply) APPLY=true; LIVE=true ;;
    --db-url)
      shift
      DB_URL="${1:-}"
      ;;
    --db-url=*) DB_URL="${1#--db-url=}" ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_pattern() {
  local file="$1"
  local pattern="$2"
  local description="$3"
  if ! grep -Eq "$pattern" "$file"; then
    echo "Missing event-hub migration contract: $description" >&2
    echo "  file: $file" >&2
    exit 1
  fi
}

for file in "$LINK_MIGRATION" "$SECURITY_MIGRATION"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required event-hub migration: $file" >&2
    exit 1
  fi
done

require_pattern "$LINK_MIGRATION" \
  'ADD COLUMN IF NOT EXISTS hub_id text REFERENCES public\.hub_venues' \
  'map_beacons.hub_id foreign key'
require_pattern "$SECURITY_MIGRATION" \
  'CREATE OR REPLACE FUNCTION public\.fetch_my_active_map_beacons' \
  'caller-scoped active-beacon RPC'
require_pattern "$SECURITY_MIGRATION" \
  'beacon\.creator_id = auth\.uid\(\)' \
  'caller identity predicate'
require_pattern "$SECURITY_MIGRATION" \
  'REVOKE EXECUTE ON FUNCTION public\.fetch_creator_active_map_beacons\(uuid, integer\) FROM authenticated' \
  'legacy arbitrary-creator RPC revocation'
require_pattern "$SECURITY_MIGRATION" \
  "VALUES \('hub-media', 'hub-media', false\)" \
  'private hub-media bucket'
require_pattern "$SECURITY_MIGRATION" \
  'CREATE TRIGGER sync_event_hub_beacon_link_after_write' \
  'canonical event-hub link synchronization trigger'

echo "event-hub migration contract: passed"

if ! $LIVE; then
  exit 0
fi

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    local trimmed="${line%%#*}"
    trimmed="${trimmed#"${trimmed%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    [[ -n "$trimmed" && "$trimmed" == *=* ]] || continue
    local key="${trimmed%%=*}"
    local value="${trimmed#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$file"
}

load_env_file "$ROOT/.env.local"
load_env_file "$ROOT/.env"
DB_URL="${DB_URL:-${SUPABASE_DB_URL:-${DATABASE_URL:-}}}"

if $APPLY; then
  (cd "$ROOT" && bash scripts/apply-supabase-migrations.sh)
fi

run_sql() {
  if [[ -n "$DB_URL" ]] && command -v psql >/dev/null 2>&1; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f "$SQL"
    return
  fi
  if command -v npx >/dev/null 2>&1; then
    (cd "$ROOT" && npx --no-install supabase db query --linked --file "$SQL")
    return
  fi
  echo "Need psql + SUPABASE_DB_URL/DATABASE_URL, or a linked Supabase CLI." >&2
  exit 1
}

echo "Running live map_beacons.hub_id checks..."
run_sql
echo "map_beacons.hub_id live checks passed."
