#!/usr/bin/env bash
# Apply (optional) and assert map_beacons.hub_id against a live Postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL="$ROOT/scripts/test_map_beacons_hub_id.sql"
APPLY_SQL="$ROOT/scripts/event_auto_hubs.sql"
APPLY=false
DB_URL="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

usage() {
  cat <<'EOF'
Usage: scripts/test_map_beacons_hub_id.sh [--apply] [--db-url URL]

  --apply     Run scripts/event_auto_hubs.sql first (idempotent).
  --db-url    Postgres URI (else SUPABASE_DB_URL or DATABASE_URL).

Loads click-web .env.local / .env without overriding the shell.
Requires psql, or a linked Supabase CLI project.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --db-url)
      shift
      DB_URL="${1:-}"
      ;;
    --db-url=*)
      DB_URL="${arg#--db-url=}"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift || true
done

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    local trimmed="${line%%#*}"
    trimmed="${trimmed#"${trimmed%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    [[ -n "$trimmed" ]] || continue
    [[ "$trimmed" == *=* ]] || continue
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

if [[ ! -f "$SQL" ]]; then
  echo "Missing $SQL" >&2
  exit 1
fi

run_sql() {
  local file="$1"
  if [[ -n "$DB_URL" ]] && command -v psql >/dev/null 2>&1; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f "$file"
    return
  fi
  if command -v npx >/dev/null 2>&1; then
    if npx -y supabase@latest db --help 2>/dev/null | grep -q 'execute'; then
      (cd "$ROOT" && npx -y supabase@latest db execute --file "$file")
      return
    fi
    if npx -y supabase@latest sql --help >/dev/null 2>&1; then
      (cd "$ROOT" && npx -y supabase@latest sql --file "$file")
      return
    fi
  fi
  echo "Need psql + SUPABASE_DB_URL/DATABASE_URL, or a linked Supabase CLI." >&2
  echo "Example: SUPABASE_DB_URL=postgresql://... bash scripts/test_map_beacons_hub_id.sh" >&2
  exit 1
}

if $APPLY; then
  echo "Applying $APPLY_SQL ..."
  run_sql "$APPLY_SQL"
fi

echo "Testing map_beacons.hub_id ..."
run_sql "$SQL"
echo "map_beacons.hub_id migration tests passed."
