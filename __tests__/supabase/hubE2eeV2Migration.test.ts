/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const migrationPath = path.join(repoRoot, 'supabase/migrations/20260906000000_hub_e2ee_v2.sql');
const pgTapPath = path.join(repoRoot, 'supabase/tests/hub_e2ee_v2_security.sql');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('hub E2EE v2 Supabase source contract', () => {
  const migration = read(migrationPath);
  const pgTap = read(pgTapPath);

  it('adds private hub epoch/envelope storage with bounded constraints', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.hub_key_epochs');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.hub_recipient_key_envelopes');
    expect(migration).toContain('REFERENCES public.hub_venues (id) ON DELETE CASCADE');
    expect(migration).toContain('REFERENCES public.chat_devices (id) ON DELETE CASCADE');
    expect(migration).toContain('CHECK (epoch > 0)');
    expect(migration).toContain("CHECK (envelope LIKE 'e2e2:%')");
    expect(migration).toContain('PRIMARY KEY (hub_id, epoch, recipient_device_id)');
    expect(migration).not.toMatch(/^\s*(DROP TABLE|TRUNCATE|DELETE FROM)\b/im);
  });

  it('keeps lifecycle mutations service-only and removes direct hub message writes', () => {
    expect(migration).toContain('REVOKE ALL ON public.hub_key_epochs FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON public.hub_recipient_key_envelopes FROM authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.create_or_rotate_hub_epoch');
    expect(migration).toContain('TO service_role;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_hub_key_envelopes_for_device');
    expect(migration).toContain('REVOKE INSERT ON public.hub_messages FROM authenticated;');
    expect(migration).toContain('DROP POLICY IF EXISTS "hub_messages_insert_authorized"');
  });

  it('checks current hub participants and active chat device identities', () => {
    expect(migration).toContain('public.hub_participants');
    expect(migration).toContain("d.key_algorithm = 'X25519'");
    expect(migration).toContain('d.crypto_version = 2');
    expect(migration).toContain('d.revoked_at IS NULL');
    expect(migration).toContain('active hub device identifiers are ambiguous');
    expect(migration).toContain('hub recipient device set does not match active hub devices');
  });

  it('ships executable pgTAP coverage for privilege, policy, and lifecycle boundaries', () => {
    expect(pgTap).toContain('SELECT plan(');
    expect(pgTap).toContain('hub_key_epochs');
    expect(pgTap).toContain('hub_recipient_key_envelopes');
    expect(pgTap).toContain("has_function_privilege('service_role'");
    expect(pgTap).toContain("has_function_privilege('authenticated'");
    expect(pgTap).toContain("throws_ok(");
    expect(pgTap).toContain('SELECT * FROM finish();');
  });
});
