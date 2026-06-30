/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/profile/timeline/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminClient = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/connectionWriteAuth', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

jest.mock('@/lib/server/chatGatekeeper', () => ({
  assertChatWritable: jest.fn(async () => null),
}));

type Entry = {
  id: string;
  target_type: 'user' | 'chat';
  target_id: string;
  author_user_id: string;
  body: string;
  visibility: 'private' | 'shared' | 'everyone';
  created_at: string;
};

function createTimelineAdmin() {
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const chatId = '11111111-1111-4111-8111-111111111111';
  const connectionId = '22222222-2222-4222-8222-222222222222';
  const groupId = '33333333-3333-4333-8333-333333333333';
  const entries: Entry[] = [];
  const users = new Map<string, Record<string, unknown>>([
    [userA, { id: userA, name: 'User A', email: 'a@click.test' }],
    [userB, { id: userB, name: 'User B', email: 'b@click.test' }],
  ]);

  const from = jest.fn((table: string) => {
    if (table === 'profile_timeline_entries') {
      return {
        select: jest.fn(() => {
          let targetType = '';
          let targetIds: string[] = [];
          let viewerId = '';
          const chain = {
            eq: (col: string, value: string) => {
              if (col === 'target_type') targetType = value;
              if (col === 'target_id') targetIds = [value];
              return chain;
            },
            in: (col: string, values: string[]) => {
              if (col === 'target_id') targetIds = values;
              return chain;
            },
            or: (expr: string) => {
              viewerId = expr.split('author_user_id.eq.')[1] ?? '';
              return chain;
            },
            order: () => chain,
            limit: async () => ({
              data: entries
                .filter((entry) => entry.target_type === targetType && targetIds.includes(entry.target_id))
                .filter(
                  (entry) =>
                    entry.author_user_id === viewerId ||
                    entry.visibility === 'shared' ||
                    entry.visibility === 'everyone',
                )
                .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
              error: null,
            }),
          };
          return chain;
        }),
        insert: jest.fn((row: Omit<Entry, 'id' | 'created_at'>) => {
          entries.push({
            id: `entry-${entries.length + 1}`,
            created_at: new Date().toISOString(),
            ...row,
          });
          return Promise.resolve({ error: null });
        }),
      };
    }

    if (table === 'connections') {
      return {
        select: jest.fn(() => ({
          contains: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { user_ids: [userA, userB] }, error: null }),
            }),
          }),
          eq: () => ({
            maybeSingle: async () => ({ data: { user_ids: [userA, userB] }, error: null }),
          }),
        })),
      };
    }

    if (table === 'chats') {
      return {
        select: jest.fn(() => ({
          or: (expr: string) => ({
            maybeSingle: async () => {
              const found =
                expr.includes(`id.eq.${chatId}`) ||
                expr.includes(`connection_id.eq.${connectionId}`) ||
                expr.includes(`group_id.eq.${groupId}`);
              return {
                data: found ? { id: chatId, connection_id: connectionId, group_id: groupId } : null,
                error: null,
              };
            },
          }),
        })),
      };
    }

    if (table === 'group_members') {
      return {
        select: jest.fn(() => ({
          eq: () =>
            Promise.resolve({
              data: [{ user_id: userA }, { user_id: userB }],
              error: null,
            }),
        })),
      };
    }

    if (table === 'users') {
      return {
        select: jest.fn(() => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids.map((id) => users.get(id)).filter(Boolean),
              error: null,
            }),
        })),
      };
    }

    if (table === 'user_interests') {
      return {
        select: jest.fn(() => ({
          in: () => Promise.resolve({ data: [], error: null }),
        })),
      };
    }

    throw new Error(`unexpected table ${table}`);
  });

  return { from, entries, userA, userB, chatId, connectionId, groupId };
}

describe('/api/profile/timeline', () => {
  it('accepts everyone visibility and lets connected peers read the entry', async () => {
    const admin = createTimelineAdmin();
    mockCreateAdminClient.mockReturnValue(admin);
    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      supabase: {},
      user: { id: admin.userA },
      authError: null,
    });

    const post = await POST(
      new NextRequest('http://localhost/api/profile/timeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target_type: 'user',
          target_id: admin.userB,
          body: 'Great coffee chat',
          visibility: 'everyone',
        }),
      }),
    );

    expect(post.status).toBe(200);
    expect(admin.entries[0]?.visibility).toBe('shared');

    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      supabase: {},
      user: { id: admin.userB },
      authError: null,
    });

    const get = await GET(
      new NextRequest(
        `http://localhost/api/profile/timeline?target_type=user&target_id=${admin.userB}`,
      ),
    );
    const body = (await get.json()) as { journal_entries?: Entry[] };
    expect(get.status).toBe(200);
    expect(body.journal_entries?.map((entry) => entry.body)).toEqual(['Great coffee chat']);
  });

  it('canonicalizes group timelines and lets group members read everyone entries', async () => {
    const admin = createTimelineAdmin();
    mockCreateAdminClient.mockReturnValue(admin);
    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      supabase: {},
      user: { id: admin.userA },
      authError: null,
    });

    const post = await POST(
      new NextRequest('http://localhost/api/profile/timeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target_type: 'chat',
          target_id: admin.connectionId,
          body: 'Group memory',
          visibility: 'everyone',
        }),
      }),
    );

    expect(post.status).toBe(200);
    expect(admin.entries[0]?.target_id).toBe(admin.chatId);
    expect(admin.entries[0]?.visibility).toBe('shared');

    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      supabase: {},
      user: { id: admin.userB },
      authError: null,
    });

    const get = await GET(
      new NextRequest(
        `http://localhost/api/profile/timeline?target_type=chat&target_id=${admin.groupId}`,
      ),
    );
    const body = (await get.json()) as { journal_entries?: Entry[] };
    expect(get.status).toBe(200);
    expect(body.journal_entries?.map((entry) => entry.body)).toEqual(['Group memory']);
  });

  it('reads older group entries stored under connection ids', async () => {
    const admin = createTimelineAdmin();
    admin.entries.push({
      id: 'legacy-entry',
      target_type: 'chat',
      target_id: admin.connectionId,
      author_user_id: admin.userA,
      body: 'Legacy group memory',
      visibility: 'everyone',
      created_at: new Date().toISOString(),
    });
    mockCreateAdminClient.mockReturnValue(admin);
    mockGetSupabaseFromRouteRequest.mockResolvedValueOnce({
      supabase: {},
      user: { id: admin.userB },
      authError: null,
    });

    const get = await GET(
      new NextRequest(
        `http://localhost/api/profile/timeline?target_type=chat&target_id=${admin.groupId}`,
      ),
    );
    const body = (await get.json()) as { journal_entries?: Entry[] };
    expect(get.status).toBe(200);
    expect(body.journal_entries?.map((entry) => entry.body)).toEqual(['Legacy group memory']);
  });
});
