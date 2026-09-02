#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="${ROOT}/supabase/tests/.migration_paths_bootstrap_fixture"

cleanup() {
  rm -f "${FIXTURE}"
}
trap cleanup EXIT

# `supabase test db` mounts supabase/tests into the pg_prove container but does
# not expose sibling migration files. Copy the source-of-truth migration into
# a non-SQL fixture so pg_prove does not treat it as a separate test file.
cp "${ROOT}/supabase/migrations/20260330000000_legacy_schema_bootstrap.sql" "${FIXTURE}"
npx --no-install supabase test db
