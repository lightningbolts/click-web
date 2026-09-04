/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('event-hub production containment migration', () => {
  const migration = read('supabase/migrations/20260901300000_event_hub_security_reconciliation.sql');

  it('replaces authenticated arbitrary-user location access with a caller-scoped RPC', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.fetch_my_active_map_beacons');
    expect(migration).toContain('WHERE beacon.creator_id = auth.uid()');
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) FROM authenticated;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) TO service_role;',
    );
  });

  it('removes explicit anonymous RPC grants left by legacy definitions', () => {
    for (const statement of [
      'REVOKE EXECUTE ON FUNCTION public.auth_uid_in_hub(text) FROM anon;',
      'REVOKE EXECUTE ON FUNCTION public.fetch_map_beacons_within(double precision, double precision, double precision, integer) FROM anon;',
      'REVOKE EXECUTE ON FUNCTION public.fetch_my_active_map_beacons(integer) FROM anon;',
      'REVOKE EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) FROM anon;',
    ]) {
      expect(read('supabase/migrations/20260903000000_event_rpc_anon_grants_reconciliation.sql')).toContain(statement);
    }
  });

  it('keeps the auth contact-hash trigger able to resolve pgcrypto safely', () => {
    const migration = read(
      'supabase/migrations/20260903100000_contact_hash_trigger_search_path.sql',
    );
    expect(migration).toContain('ALTER FUNCTION public.sync_user_contact_hashes()');
    expect(migration).toContain('SET search_path = public, extensions, pg_temp;');
  });

  it('removes the legacy broad waitlist insert policy', () => {
    expect(
      read('supabase/migrations/20260903200000_waitlist_legacy_policy_cleanup.sql'),
    ).toContain('DROP POLICY IF EXISTS "Allow public waitlist inserts" ON public.waitlist;');
  });

  it('keeps new hub media private and provides a canonical event-hub relationship', () => {
    expect(migration).toContain("VALUES ('hub-media', 'hub-media', false)");
    expect(migration).toContain('CREATE TRIGGER sync_event_hub_beacon_link_after_write');
    expect(migration).toContain('map_beacons.hub_id is a synchronized compatibility field');
  });

  it('makes database and realtime authorization recheck active event access', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.auth_uid_in_hub');
    expect(migration).toContain('check_in.checked_out_at IS NULL');
    expect(migration).toContain('CREATE POLICY "hub_messages_select_authorized"');
    expect(migration).toContain('CREATE POLICY "hub_messages_insert_authorized"');
    expect(migration).toContain('public.auth_uid_in_hub(hub_id)');
  });

  it('makes product map routes use the caller-scoped RPC', () => {
    const beaconsRoute = read('app/api/beacons/route.ts');
    const legacyRoute = read('app/api/map/beacons/route.ts');
    for (const source of [beaconsRoute, legacyRoute]) {
      expect(source).toContain('fetch_my_active_map_beacons');
      expect(source).not.toContain('admin.rpc("fetch_creator_active_map_beacons"');
    }
  });

  it('projects hub ids from the canonical relationship in every forward RPC', () => {
    expect(migration).toContain('LEFT JOIN public.hub_venues AS hub ON hub.event_beacon_id = beacon.id');
    expect(migration).toContain("'hub_id', hub.id");
    expect(migration).not.toContain("'hub_id', beacon.hub_id");
  });

  it('reconciles event hub foreign keys by relationship instead of generated names', () => {
    expect(migration).toContain("conrelid = 'public.hub_venues'::regclass");
    expect(migration).toContain("confrelid = 'public.map_beacons'::regclass");
    expect(migration).toContain("conrelid = 'public.map_beacons'::regclass");
    expect(migration).toContain("confrelid = 'public.hub_venues'::regclass");
    expect(migration).toContain("DROP CONSTRAINT %I");
    expect(migration).toContain('ADD CONSTRAINT hub_venues_event_beacon_id_fkey');
    expect(migration).toContain('ADD CONSTRAINT map_beacons_hub_id_fkey');
  });
});
