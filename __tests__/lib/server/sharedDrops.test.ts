/** @jest-environment node */

jest.mock('server-only', () => ({}));

const mockPeers = jest.fn();
jest.mock('@/lib/server/connections/viewerPeers', () => ({
  loadViewerPeers: (...args: unknown[]) => mockPeers(...args),
}));

import { loadPosterViews, resolveSharedDrops } from '@/lib/server/sharedDrops';

function admin(tables: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'gt', 'order', 'limit']) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: tables[table] ?? [], error: null }));
      return chain;
    },
  };
}

const drop = (id: string, user: string, audience: 'all' | 'core') => ({
  id,
  user_id: user,
  audience,
  client_drop_id: `c-${id}`,
  original_path: `shared/${user}/${user}/${id}-original.jpg`,
  preview_path: `shared/${user}/${user}/${id}-preview.jpg`,
  width: null,
  height: null,
  created_at: '2026-10-05T10:00:00Z',
  reveal_at: '2026-10-06T10:00:00Z',
});

describe('shared drop audience resolution', () => {
  beforeEach(() => {
    mockPeers.mockResolvedValue(
      new Map([
        ['ana', { userId: 'ana', connectionId: 'c-ana', isCore: false }],
        ['ben', { userId: 'ben', connectionId: 'c-ben', isCore: false }],
        ['cal', { userId: 'cal', connectionId: 'c-cal', isCore: false }],
      ]),
    );
  });

  it("reads the poster's side: archived/hidden connections and core marks", async () => {
    const views = await loadPosterViews(
      admin({
        connection_archives: [{ user_id: 'ben', connection_id: 'c-ben' }],
        connection_hidden: [],
        connection_core: [{ user_id: 'ana', connection_id: 'c-ana' }],
      }) as never,
      'me',
      ['ana', 'ben', 'stranger'],
    );
    expect(views.get('ana')).toMatchObject({ posterKeepsConnection: true, posterMarkedCore: true });
    expect(views.get('ben')).toMatchObject({ posterKeepsConnection: false });
    expect(views.has('stranger')).toBe(false);
  });

  it('lets a viewer develop only drops the audience admits right now', async () => {
    const resolved = await resolveSharedDrops(
      admin({
        shared_drops: [
          drop('ana-core', 'ana', 'core'),
          drop('cal-core', 'cal', 'core'),
          drop('ben-all', 'ben', 'all'),
          drop('cal-all', 'cal', 'all'),
          drop('stranger-all', 'stranger', 'all'),
          drop('mine', 'me', 'core'),
        ],
        connection_archives: [{ user_id: 'ben', connection_id: 'c-ben' }],
        connection_hidden: [],
        connection_core: [{ user_id: 'ana', connection_id: 'c-ana' }],
      }) as never,
      'me',
      ['ana-core', 'cal-core', 'ben-all', 'cal-all', 'stranger-all', 'mine'],
    );
    expect([...resolved.keys()].sort()).toEqual(['ana-core', 'cal-all', 'mine']);
  });
});
