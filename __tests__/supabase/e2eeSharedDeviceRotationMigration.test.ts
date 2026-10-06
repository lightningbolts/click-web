/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/migrations/20261022000000_e2ee_shared_device_rotation.sql'),
  'utf8',
);

describe('chat epoch rotation with one phone in several member accounts', () => {
  it('treats a shared device_id as ambiguous only when its public keys differ', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_or_rotate_chat_epoch(');
    expect(migration).toContain('HAVING count(DISTINCT d.identity_public_key) > 1');
    expect(migration).not.toContain('HAVING count(*) > 1');
  });

  it('stores the one wrap for every member row sharing that device', () => {
    expect(migration).toMatch(
      /INSERT INTO public\.chat_recipient_key_envelopes[\s\S]*SELECT p_chat_id, p_epoch, d\.id, v_sender_device, item->>'envelope'[\s\S]*JOIN public\.chat_devices d/,
    );
  });

  it('keeps every other boundary of the lifecycle RPC', () => {
    for (const guard of [
      'actor is not a chat member',
      'all chat members need E2EE v2 devices',
      'sender device is not active',
      'epoch must advance monotonically',
      'duplicate recipient device',
      'invalid epoch-key envelope set',
      'recipient device set does not match active chat devices',
    ]) {
      expect(migration).toContain(guard);
    }
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).not.toMatch(/^\s*(DROP TABLE|TRUNCATE|DELETE FROM)\b/im);
  });
});
