/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { PATCH as profilePatch } from '@/app/api/users/[userId]/profile/route';
import { DELETE as avatarDelete } from '@/app/api/user/avatar/route';
import { makeSupabaseMock } from '../../../helpers/supabaseRouteMocks';

const mockGetSupabaseFromRouteRequest = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));
jest.mock('@/lib/server/supabaseAuth', () => ({ getAuthenticatedSupabase: jest.fn() }));
jest.mock('@/lib/server/connectionWriteAuth', () => ({ createAdminClient: jest.fn() }));

const USER_ID = 'user-bio-1';

function patch(body: unknown) {
  return profilePatch(
    new NextRequest(`http://localhost/api/users/${USER_ID}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ userId: USER_ID }) },
  );
}

describe('PATCH /api/users/{id}/profile bio', () => {
  it('stores a trimmed bio and clears an empty one', async () => {
    const mock = makeSupabaseMock({ tables: { users: { data: { id: USER_ID, bio: 'Climber' }, error: null } } });
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase: mock.supabase, user: { id: USER_ID }, authError: null });

    const res = await patch({ bio: '  Climber  ' });
    expect(res.status).toBe(200);
    expect(mock.builder('users').calls.update?.[0]?.[0]).toEqual({ bio: 'Climber' });

    const cleared = await patch({ bio: '' });
    expect(cleared.status).toBe(200);
    expect(mock.builder('users').calls.update?.[1]?.[0]).toEqual({ bio: null });
  });

  it('rejects a bio over 160 characters', async () => {
    const mock = makeSupabaseMock({ tables: { users: { data: null, error: null } } });
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase: mock.supabase, user: { id: USER_ID }, authError: null });
    const res = await patch({ bio: 'x'.repeat(161) });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/user/avatar', () => {
  it('clears users.image and removes stored objects', async () => {
    const mock = makeSupabaseMock({ tables: { users: { data: null, error: null } } });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const list = jest.fn().mockResolvedValue({ data: [{ name: '1.jpg' }, { name: '2.png' }], error: null });
    const supabase = { ...mock.supabase, storage: { from: jest.fn(() => ({ list, remove })) } };
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase, user: { id: USER_ID }, authError: null });

    const res = await avatarDelete(new NextRequest('http://localhost/api/user/avatar', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ image: null });
    expect(mock.builder('users').calls.update?.[0]?.[0]).toEqual({ image: null });
    expect(remove).toHaveBeenCalledWith([`${USER_ID}/1.jpg`, `${USER_ID}/2.png`]);
  });

  it('returns 401 without a user', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase: {}, user: null, authError: new Error('x') });
    const res = await avatarDelete(new NextRequest('http://localhost/api/user/avatar', { method: 'DELETE' }));
    expect(res.status).toBe(401);
  });
});
