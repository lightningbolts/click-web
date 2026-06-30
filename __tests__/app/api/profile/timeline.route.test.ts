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
          let targetId = '';
          let viewerId = '';
          const chain = {
            eq: (col: string, value: string) => {
              if (col === 'target_type') targetType = value;
              if (col === 'target_id') targetId = value;
              return chain;
            },
            or: (expr: string) => {
              viewerId = expr.split('author_user_id.eq.')[1] ?? '';
              return chain;
            },
            order: () => chain,
            limit: async () => ({
              data: entries
                .filter((entry) => entry.target_type === targetType && entry.target_id === targetId)
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

  return { from, entries, userA, userB };
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
});
