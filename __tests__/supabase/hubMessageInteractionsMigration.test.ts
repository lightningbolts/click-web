import fs from 'node:fs';
import path from 'node:path';

describe('hub message interactions migration', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260917235000_hub_message_interactions.sql'),
    'utf8',
  );

  it('adds server-persisted edit timestamps and dedicated Hub reactions', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS edited_at timestamptz');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.hub_message_reactions');
    expect(sql).toContain('REFERENCES public.hub_messages(id) ON DELETE CASCADE');
    expect(sql).toContain('UNIQUE (hub_message_id, user_id, reaction_type)');
  });

  it('keeps client writes API-only while allowing participant-scoped reads', () => {
    expect(sql).toContain('REVOKE ALL ON public.hub_message_reactions FROM authenticated');
    expect(sql).toContain('GRANT SELECT ON public.hub_message_reactions TO authenticated');
    expect(sql).toContain('USING (public.auth_uid_in_hub(hub_id))');
  });

  it('publishes deterministic delete payloads over realtime', () => {
    expect(sql).toContain('REPLICA IDENTITY FULL');
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.hub_message_reactions');
  });
});
