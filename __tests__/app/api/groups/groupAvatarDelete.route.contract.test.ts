/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { DELETE as groupAvatarDelete } from '@/app/api/groups/[groupId]/avatar/route';
import { makeSupabaseMock } from '../../../helpers/supabaseRouteMocks';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminClient = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));
jest.mock('@/lib/server/supabaseAuth', () => ({ getAuthenticatedSupabase: jest.fn() }));
jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

const USER_ID = 'member-1';
const GROUP_ID = 'group-1';
const AVATAR = `https://x.supabase.co/storage/v1/object/public/avatars/uploader-9/groups/${GROUP_ID}/123.jpg`;

function remove(groupId = GROUP_ID) {
  return groupAvatarDelete(
    new NextRequest(`http://localhost/api/groups/${groupId}/avatar`, { method: 'DELETE' }),
    { params: Promise.resolve({ groupId }) },
  );
}

function admin(options: { member: unknown; group: unknown }) {
  const mock = makeSupabaseMock({
    tables: {
      group_members: { data: options.member, error: null },
      groups: { data: options.group, error: null },
    },
  });
  const storageRemove = jest.fn().mockResolvedValue({ error: null });
  mockCreateAdminClient.mockReturnValue({ ...mock.supabase, storage: { from: jest.fn(() => ({ remove: storageRemove })) } });
  return { mock, storageRemove };
}

describe('DELETE /api/groups/{groupId}/avatar', () => {
  beforeEach(() => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase: {}, user: { id: USER_ID }, authError: null });
  });

  it('clears avatar_url and removes this group’s stored object', async () => {
    const { mock, storageRemove } = admin({
      member: { user_id: USER_ID },
      group: { id: GROUP_ID, avatar_url: AVATAR, profile_updated_at: null },
    });
    const res = await remove();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image).toBeNull();
    const update = mock.builder('groups').calls.update?.[0]?.[0] as Record<string, unknown>;
    expect(update.avatar_url).toBeNull();
    expect(update.profile_updated_by).toBe(USER_ID);
    expect(storageRemove).toHaveBeenCalledWith([`uploader-9/groups/${GROUP_ID}/123.jpg`]);
  });

  it('never removes an object outside the group folder', async () => {
    const { storageRemove } = admin({
      member: { user_id: USER_ID },
      group: { id: GROUP_ID, avatar_url: 'https://x/storage/v1/object/public/avatars/someone/profile.jpg', profile_updated_at: null },
    });
    expect((await remove()).status).toBe(200);
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it('403 for non-members', async () => {
    admin({ member: null, group: { id: GROUP_ID } });
    expect((await remove()).status).toBe(403);
  });

  it('429 inside the profile-change cooldown', async () => {
    admin({ member: { user_id: USER_ID }, group: { id: GROUP_ID, avatar_url: AVATAR, profile_updated_at: new Date().toISOString() } });
    expect((await remove()).status).toBe(429);
  });

  it('401 without a user', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({ supabase: {}, user: null, authError: new Error('x') });
    expect((await remove()).status).toBe(401);
  });
});
