/**
 * @jest-environment node
 */
jest.mock('server-only', () => ({}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';
import { acceptInvite, createInvite, hashInviteToken, lastOwnerBlocks, normalizeEmail } from '@/lib/server/places/invites';
import { isLastOwner } from '@/components/business/TeamManager';

const client = (db: FakeDb) => db.client as unknown as SupabaseClient;

describe('Place team invites (spec §9.5 Team, phase 5b)', () => {
  it('never leaves a Place without an owner', () => {
    expect(lastOwnerBlocks(1, 'owner', 'manager')).toBe(true);
    expect(lastOwnerBlocks(1, 'owner', null)).toBe(true);
    expect(lastOwnerBlocks(2, 'owner', null)).toBe(false);
    expect(lastOwnerBlocks(1, 'manager', null)).toBe(false);
    expect(lastOwnerBlocks(1, 'owner', 'owner')).toBe(false);
    expect(isLastOwner([{ role: 'owner' }, { role: 'manager' }], { role: 'owner' })).toBe(true);
  });

  it('normalizes emails and rejects junk', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(normalizeEmail('nope')).toBeNull();
  });

  it('stores only the token hash and revokes the previous open invite for the address', async () => {
    const db = new FakeDb({ tables: { place_manager_invites: [] } });
    const first = await createInvite(client(db), { placeId: 'p1', email: 'a@x.co', role: 'manager', invitedBy: 'owner' });
    const second = await createInvite(client(db), { placeId: 'p1', email: 'a@x.co', role: 'viewer', invitedBy: 'owner' });
    const rows = db.rows('place_manager_invites');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.token_hash)).toEqual([hashInviteToken(first.token), hashInviteToken(second.token)]);
    expect(rows.some((r) => r.token_hash === first.token)).toBe(false);
    expect(rows[0].revoked_at).toBeTruthy();
    expect(rows[1].revoked_at).toBeUndefined();
  });

  it('joins only the matching account and never lowers an existing role', async () => {
    const db = new FakeDb({ tables: { place_managers: [{ place_id: 'p1', user_id: 'u2', role: 'owner' }], place_manager_invites: [{ id: 'i1', accepted_at: null }] } });
    const invite = { kind: 'ok' as const, id: 'i1', placeId: 'p1', placeName: 'Café', email: 'a@x.co', role: 'manager' as const };
    expect(await acceptInvite(client(db), invite, { id: 'u1', email: 'other@x.co' })).toBe('wrong_email');
    expect(await acceptInvite(client(db), invite, { id: 'u1', email: 'A@x.co' })).toBe('accepted');
    expect(db.rows('place_managers')).toContainEqual({ place_id: 'p1', user_id: 'u1', role: 'manager', id: expect.any(String) });
    expect(db.rows('place_manager_invites')[0]).toMatchObject({ accepted_by: 'u1' });

    await acceptInvite(client(db), { ...invite, role: 'viewer', email: 'b@x.co' }, { id: 'u2', email: 'b@x.co' });
    expect(db.rows('place_managers').find((m) => m.user_id === 'u2')?.role).toBe('owner');
  });
});
