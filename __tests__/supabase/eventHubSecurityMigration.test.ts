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
});
