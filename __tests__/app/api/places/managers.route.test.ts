/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));
let db: FakeDb;
let role: 'owner' | 'manager' | 'viewer' = 'owner';
jest.mock('@/lib/server/places/routeContext', () => ({
  requirePlaceManagerContext: async (_req: unknown, _id: string, options: { roles?: string[] } = {}) =>
    options.roles && !options.roles.includes(role)
      ? { ok: false, response: NextResponse.json({ error: 'Your role cannot change this Place', code: 'insufficient_role' }, { status: 403 }) }
      : { ok: true, admin: db.client, user: { id: 'me' }, place: { id: 'p1' }, role },
}));

import { DELETE, PATCH } from '@/app/api/places/[placeId]/managers/[userId]/route';

const call = (method: 'PATCH' | 'DELETE', userId: string, body?: unknown) => {
  const req = new NextRequest(`https://x/api/places/p1/managers/${userId}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
  return (method === 'PATCH' ? PATCH : DELETE)(req, { params: Promise.resolve({ placeId: 'p1', userId }) });
};

beforeEach(() => {
  role = 'owner';
  db = new FakeDb({
    tables: {
      place_managers: [
        { place_id: 'p1', user_id: 'me', role: 'owner' },
        { place_id: 'p1', user_id: 'sam', role: 'manager' },
      ],
    },
  });
});

describe('Team routes (spec §9.5)', () => {
  it('refuses to demote or remove the last owner', async () => {
    const demote = await call('PATCH', 'me', { role: 'manager' });
    expect(demote.status).toBe(409);
    expect((await demote.json()).code).toBe('last_owner');
    expect((await call('DELETE', 'me')).status).toBe(409);
  });

  it('lets the owner change roles and remove people', async () => {
    expect((await call('PATCH', 'sam', { role: 'owner' })).status).toBe(200);
    expect((await call('PATCH', 'me', { role: 'viewer' })).status).toBe(200);
    expect(db.rows('place_managers').map((m) => m.role)).toEqual(['viewer', 'owner']);
    expect((await call('DELETE', 'me')).status).toBe(200);
    expect(db.rows('place_managers')).toHaveLength(1);
  });

  it('is owner-only', async () => {
    role = 'manager';
    expect((await call('PATCH', 'sam', { role: 'viewer' })).status).toBe(403);
    expect((await call('DELETE', 'sam')).status).toBe(403);
  });
});
