#!/usr/bin/env bash
# Apply pending Supabase migrations safely (validates only not-yet-applied files, then db push).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
cd "$ROOT"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      cat <<'EOF'
Usage: scripts/apply-supabase-migrations.sh [--dry-run]

Validates pending (not-yet-applied) migration SQL for destructive patterns, then runs:
  npx supabase@latest db push --include-all

Setup:
  cd click-web && npx supabase@latest link --project-ref <ref>
  # or set SUPABASE_DB_URL for direct Postgres

Safety:
  Only scans migrations not marked Applied on the linked remote.
  Blocks DROP TABLE, TRUNCATE, DELETE FROM, and DROP COLUMN without IF EXISTS.
EOF
      exit 1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "Missing migrations directory: $MIGRATIONS_DIR" >&2
  exit 1
fi

CLI=(npx -y supabase@latest)

migration_version() {
  basename "$1" .sql | cut -d_ -f1
}

is_disallowed_sql() {
  local file="$1"
  grep -Eiq 'TRUNCATE[[:space:]]+' "$file" && return 0
  grep -Eiq 'DELETE[[:space:]]+FROM[[:space:]]+' "$file" && return 0
  grep -Eiq 'DROP[[:space:]]+SCHEMA[[:space:]]+' "$file" && return 0
  while IFS= read -r line; do
    echo "$line" | grep -Eiq 'DROP[[:space:]]+TABLE[[:space:]]+' || continue
    echo "$line" | grep -Eiq 'IF[[:space:]]+EXISTS' && continue
    return 0
  done < "$file"
  while IFS= read -r line; do
    echo "$line" | grep -Eiq 'DROP[[:space:]]+COLUMN[[:space:]]+' || continue
    echo "$line" | grep -Eiq 'IF[[:space:]]+EXISTS' && continue
    return 0
  done < "$file"
  return 1
}

list_file="$(mktemp)"
if ! "${CLI[@]}" migration list --linked >"$list_file" 2>/dev/null; then
  rm -f "$list_file"
  echo "Supabase project not linked; validating known scale migration only." >&2
  pending_files=()
  scale_file="$MIGRATIONS_DIR/20260701120000_scale_remediation_rpcs.sql"
  [[ -f "$scale_file" ]] && pending_files=("$scale_file")
else
  applied_versions=$(awk '$0 ~ /Applied/ { print $1 }' "$list_file" | sort -u)
  rm -f "$list_file"
  pending_files=()
  for file in "$MIGRATIONS_DIR"/*.sql; do
    [[ -f "$file" ]] || continue
    version="$(migration_version "$file")"
    if echo "$applied_versions" | grep -qx "$version"; then
      continue
    fi
    pending_files+=("$file")
  done
fi

if ((${#pending_files[@]} == 0)); then
  echo "No pending local migrations to validate."
else
  echo "Validating ${#pending_files[@]} pending migration(s)..."
  violations=()
  for file in "${pending_files[@]}"; do
    if is_disallowed_sql "$file"; then
      violations+=("$(basename "$file") contains disallowed destructive SQL")
    fi
  done
  if ((${#violations[@]} > 0)); then
    echo "Migration safety check failed:" >&2
    printf '  - %s\n' "${violations[@]}" >&2
    exit 1
  fi
  echo "Migration safety check passed."
fi

if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  export SUPABASE_ACCESS_TOKEN
fi

if $DRY_RUN; then
  echo "[dry-run] Would run: ${CLI[*]} db push --include-all"
  "${CLI[@]}" migration list --linked 2>/dev/null || true
  exit 0
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]] \
  && [[ ! -f "$ROOT/.supabase/project-ref" ]] \
  && [[ ! -f "$ROOT/supabase/.temp/project-ref" ]]; then
  echo "No linked Supabase project found." >&2
  echo "Run: npx supabase@latest link --project-ref <ref>" >&2
  echo "Or set SUPABASE_DB_URL." >&2
  exit 1
fi

echo "Applying pending migrations..."
"${CLI[@]}" db push --include-all
echo "Done."
