#!/usr/bin/env bash
# Races two buyers for the last ticket and two scanners for one ticket against
# the LOCAL Supabase database. Expected: exactly one claim succeeds and exactly
# one scan is accepted. Leaves no rows behind.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_click-web}"
if command -v psql >/dev/null 2>&1; then
  run_sql() { psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -qtAX -v ON_ERROR_STOP=1 -c "$1"; }
else
  run_sql() { docker exec -i "$DB_CONTAINER" psql -U postgres -qtAX -v ON_ERROR_STOP=1 -c "$1"; }
fi

HOST=00000000-0000-4000-8000-00000000fa01
BUYER_A=00000000-0000-4000-8000-00000000fa02
BUYER_B=00000000-0000-4000-8000-00000000fa03
EVENT=00000000-0000-4000-8000-00000000fb01
TIER=00000000-0000-4000-8000-00000000fc01

cleanup() {
  run_sql "
    DELETE FROM public.ticket_checkins WHERE beacon_id = '$EVENT';
    DELETE FROM public.tickets WHERE beacon_id = '$EVENT';
    DELETE FROM public.ticket_order_items WHERE order_id IN (SELECT id FROM public.ticket_orders WHERE beacon_id = '$EVENT');
    DELETE FROM public.ticket_orders WHERE beacon_id = '$EVENT';
    DELETE FROM public.map_beacons WHERE id = '$EVENT';
    DELETE FROM auth.users WHERE id IN ('$HOST', '$BUYER_A', '$BUYER_B');" >/dev/null
}
trap cleanup EXIT
cleanup

run_sql "
  INSERT INTO auth.users (id, email) VALUES
    ('$HOST', 'race-host@example.test'), ('$BUYER_A', 'race-a@example.test'), ('$BUYER_B', 'race-b@example.test');
  INSERT INTO public.map_beacons (id, creator_id, beacon_type, location, expires_at, admission_type, ticketing_status)
    VALUES ('$EVENT', '$HOST', 'event', 'SRID=4326;POINT(-122.3 47.65)', now() + interval '1 day', 'ticketed', 'sales_open');
  INSERT INTO public.ticket_tiers (id, beacon_id, name, unit_amount, capacity) VALUES ('$TIER', '$EVENT', 'Last one', 0, 1);" >/dev/null

claim() {
  local buyer=$1 ticket=$2 hash=$3
  run_sql "SELECT pg_sleep(0.2), public.ticketing_claim_free('$buyer', '$EVENT',
    '[{\"tier_id\":\"$TIER\",\"quantity\":1,\"expected_unit_amount\":0}]',
    '[{\"id\":\"$ticket\",\"tier_id\":\"$TIER\",\"ordinal\":1,\"ticket_number\":\"CLK-RACE-$hash\",\"token_hash\":\"race-$hash\"}]')->>'ok';" | cut -d'|' -f2
}

out=$(mktemp -d)
claim "$BUYER_A" 00000000-0000-4000-8000-0000000fa001 A > "$out/a" &
claim "$BUYER_B" 00000000-0000-4000-8000-0000000fa002 B > "$out/b" &
wait
claims_ok=$(cat "$out/a" "$out/b" | grep -c '^true$' || true)
echo "claims: A=$(cat "$out/a") B=$(cat "$out/b") -> $claims_ok succeeded"

hash=$(run_sql "SELECT qr_token_hash FROM public.tickets WHERE beacon_id = '$EVENT'")
scan() { run_sql "SELECT pg_sleep(0.2), public.ticketing_check_in('$EVENT', '$hash', '$HOST')->>'result';" | cut -d'|' -f2; }
scan > "$out/s1" &
scan > "$out/s2" &
wait
scans_ok=$(cat "$out/s1" "$out/s2" | grep -c '^accepted$' || true)
echo "scans: $(cat "$out/s1") / $(cat "$out/s2") -> $scans_ok accepted"
rm -rf "$out"

if [[ "$claims_ok" == 1 && "$scans_ok" == 1 ]]; then
  echo "PASS"
else
  echo "FAIL"
  exit 1
fi
