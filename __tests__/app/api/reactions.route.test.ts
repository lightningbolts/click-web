/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockResolve = jest.fn();
const mockLoad = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockRecordActivity = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => ({
    from: () => ({ upsert: (...a: unknown[]) => mockUpsert(...a), delete: () => ({ match: (...a: unknown[]) => mockDelete(...a) }) }),
  }),
}));
jest.mock('@/lib/server/reactions', () => ({
  ...jest.requireActual('@/lib/server/reactions'),
  resolveReactionTarget: (...a: unknown[]) => mockResolve(...a),
  loadReactions: (...a: unknown[]) => mockLoad(...a),
}));

jest.mock('@/lib/server/activity', () => ({
  recordReactionActivity: (...a: unknown[]) => mockRecordActivity(...a),
}));

import { PUT } from '@/app/api/reactions/[kind]/[id]/route';

const ID = '55555555-5555-4555-8555-555555555555';
const put = (kind: string, body: unknown) =>
  PUT(
    new NextRequest(`https://click.example/api/reactions/${kind}/${ID}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ kind, id: ID }) },
  );

describe('PUT /api/reactions/{kind}/{id}', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ user: { id: 'me' }, authError: null });
    mockResolve.mockResolvedValue({ ownerId: 'poster' });
    mockUpsert.mockResolvedValue({ error: null });
    mockDelete.mockResolvedValue({ error: null });
    mockRecordActivity.mockResolvedValue(undefined);
    mockLoad.mockResolvedValue({ mine: '🔥', reactions: [], is_owner: false });
  });

  it('reacts with a palette emoji, replacing any earlier one', async () => {
    const res = await put('shared_drop', { emoji: '🔥' });
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ target_kind: 'shared_drop', target_id: ID, user_id: 'me', emoji: '🔥' }));
  });

  it('tells the owner in their activity inbox', async () => {
    await put('shared_drop', { emoji: '🔥' });
    expect(mockRecordActivity).toHaveBeenCalledWith(expect.anything(), {
      kind: 'shared_drop', targetId: ID, ownerId: 'poster', actorId: 'me', emoji: '🔥',
    });
  });

  it('takes a reaction back with null', async () => {
    await put('soundtrack', { emoji: null });
    expect(mockRecordActivity).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith({ target_kind: 'soundtrack', target_id: ID, user_id: 'me' });
  });

  it('accepts any single emoji, including skin tones, ZWJ sequences and flags', async () => {
    for (const emoji of ['💩', '👍🏽', '👩‍💻', '🇯🇵', '❤️‍🔥']) expect((await put('shared_drop', { emoji })).status).toBe(200);
  });

  it('rejects text, several emoji, unknown kinds, unseen targets, and your own', async () => {
    for (const emoji of ['hi', '🔥🔥', 'a🔥', ' ', '']) expect((await put('shared_drop', { emoji })).status).toBe(400);
    expect((await put('message', { emoji: '🔥' })).status).toBe(404);
    mockResolve.mockResolvedValueOnce(null);
    expect((await put('shared_drop', { emoji: '🔥' })).status).toBe(404);
    mockResolve.mockResolvedValueOnce({ ownerId: 'me' });
    expect((await put('shared_drop', { emoji: '🔥' })).status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
