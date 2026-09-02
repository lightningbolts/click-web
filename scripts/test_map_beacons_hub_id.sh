#!/usr/bin/env bash
# Lightweight, dependency-free contract check for event-hub migrations.
# The full Jest suite adds source-level regression coverage; this script also
# runs from mobile CI before Node dependencies are installed in click-web.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINK_MIGRATION="$ROOT/supabase/migrations/20260901200000_map_beacons_hub_id.sql"
SECURITY_MIGRATION="$ROOT/supabase/migrations/20260901300000_event_hub_security_reconciliation.sql"

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
