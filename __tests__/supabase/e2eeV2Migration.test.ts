/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const migrationPath = path.join(repoRoot, 'supabase/migrations/20260904000000_e2ee_v2_foundation.sql');
const pgTapPath = path.join(repoRoot, 'supabase/tests/e2ee_v2_security.sql');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('E2EE v2 Supabase foundation source contract', () => {
  const migration = read(migrationPath);
  const pgTap = read(pgTapPath);

  it('contains only additive, idempotent foundation tables and fixed crypto constraints', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.chat_devices');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.chat_key_epochs');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.chat_recipient_key_envelopes');
    expect(migration).toContain("CHECK (key_algorithm = 'X25519')");
    expect(migration).toContain('CHECK (crypto_version = 2)');
    expect(migration).toContain('CHECK (epoch > 0)');
    expect(migration).toContain('UNIQUE (user_id, device_id)');
    expect(migration).toContain('PRIMARY KEY (chat_id, epoch, recipient_device_id)');
    expect(migration).not.toMatch(/^\s*(DROP TABLE|TRUNCATE|DELETE FROM)\b/im);
    expect(migration).not.toContain('ALTER TABLE public.chats');
    expect(migration).not.toContain('ALTER TABLE public.messages');
  });

  it('keeps v2 storage private and scopes authenticated access', () => {
    expect(migration).toContain('ALTER TABLE public.chat_devices ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('REVOKE ALL ON public.chat_devices FROM PUBLIC, anon;');
    expect(migration).toContain('REVOKE ALL ON public.chat_key_epochs FROM PUBLIC, anon;');
    expect(migration).toContain('REVOKE ALL ON public.chat_recipient_key_envelopes FROM PUBLIC, anon;');
    expect(migration).toContain('chat_devices_select_own');
    expect(migration).toContain('chat_devices_insert_own');
    expect(migration).toContain('public.auth_uid_can_access_chat(chat_id)');
    expect(migration).toContain('sender_device.user_id = auth.uid()');
    expect(migration).toContain('GRANT ALL ON public.chat_devices TO service_role;');
  });

  it('depends on the existing chat participant helper that precedes this migration', () => {
    const chatRlsMigration = read(
      'supabase/migrations/20260414183000_group_chat_rls_visibility_fix.sql',
    );
    expect(chatRlsMigration).toContain('CREATE OR REPLACE FUNCTION public.auth_uid_can_access_chat');
    expect(migration).toContain('public.auth_uid_can_access_chat(chat_id)');
  });

  it('ships pgTAP security assertions for RLS, policies, privileges, and constraints', () => {
    expect(pgTap).toContain('SELECT plan(35);');
    expect(pgTap).toContain('relrowsecurity');
    expect(pgTap).toContain('pg_policy');
    expect(pgTap).toContain('pg_constraint');
    expect(pgTap).toContain("has_table_privilege('anon'");
    expect(pgTap).toContain("has_table_privilege('service_role'");
    expect(pgTap).toContain("'42501'");
    expect(pgTap).toContain('SELECT * FROM finish();');
  });
});
