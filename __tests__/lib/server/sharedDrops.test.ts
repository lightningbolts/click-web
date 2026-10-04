/** @jest-environment node */

jest.mock('server-only', () => ({}));

const mockPeers = jest.fn();
jest.mock('@/lib/server/connections/viewerPeers', () => ({
  loadViewerPeers: (...args: unknown[]) => mockPeers(...args),
}));

import { listSharedDropArchive, loadPosterViews, resolveSharedDrops, sharedDropsConfigFrom } from '@/lib/server/sharedDrops';

function admin(tables: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'gt', 'lt', 'order', 'limit']) chain[m] = () => chain;
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

  it("reads the poster's side: hidden connections and core marks, not archived chats", async () => {
    const views = await loadPosterViews(
      admin({
        connection_archives: [{ user_id: 'cal', connection_id: 'c-cal' }],
        connection_hidden: [{ user_id: 'ben', connection_id: 'c-ben' }],
        connection_core: [{ user_id: 'ana', connection_id: 'c-ana' }],
      }) as never,
      'me',
      ['ana', 'ben', 'cal', 'stranger'],
    );
    expect(mockPeers).toHaveBeenCalledWith(expect.anything(), 'me', { includeArchived: true });
    expect(views.get('ana')).toMatchObject({ posterKeepsConnection: true, posterMarkedCore: true });
    expect(views.get('ben')).toMatchObject({ posterKeepsConnection: false });
    expect(views.get('cal')).toMatchObject({ posterKeepsConnection: true });
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
        connection_hidden: [{ user_id: 'ben', connection_id: 'c-ben' }],
        connection_core: [{ user_id: 'ana', connection_id: 'c-ana' }],
      }) as never,
      'me',
      ['ana-core', 'cal-core', 'ben-all', 'cal-all', 'stranger-all', 'mine'],
    );
    expect([...resolved.keys()].sort()).toEqual(['ana-core', 'cal-all', 'mine']);
  });
});

describe('shared drop archive', () => {
  beforeEach(() => {
    mockPeers.mockResolvedValue(new Map([['ana', { userId: 'ana', connectionId: 'c-ana', isCore: false }]]));
  });
  const at = (row: ReturnType<typeof drop>, created: string) => ({ ...row, created_at: created, reveal_at: created });
  const config = sharedDropsConfigFrom({});

  it('pages newest first through the drops the audience admits', async () => {
    const tables = {
      shared_drops: [
        at(drop('a3', 'ana', 'all'), '2026-10-05T12:00:00Z'),
        at(drop('m2', 'me', 'core'), '2026-10-05T11:00:00Z'),
        at(drop('a-core', 'ana', 'core'), '2026-10-05T10:00:00Z'),
        at(drop('a1', 'ana', 'all'), '2026-10-05T09:00:00Z'),
      ],
    };
    const full = await listSharedDropArchive(admin(tables) as never, 'me', config, { before: null, limit: 2 });
    expect(full.rows.map((r) => r.id)).toEqual(['a3', 'm2']);
    expect(full.nextBefore).toBe('2026-10-05T11:00:00Z');
    const short = await listSharedDropArchive(admin(tables) as never, 'me', config, { before: null, limit: 10 });
    expect(short.rows.map((r) => r.id)).toEqual(['a3', 'm2', 'a1']);
    expect(short.nextBefore).toBeNull();
  });
});

describe('shared drop captions', () => {
  const { visibleCaption } = jest.requireActual('@/lib/server/sharedDrops');
  const { sharedDropCreateBodySchema } = jest.requireActual('@/lib/api/schemas/drops');
  const base = { client_drop_id: '00000000-0000-4000-8000-000000000001', audience: 'all', mime_type: 'image/jpeg', original_b64: 'AA==', preview_b64: 'AA==' };

  it('shows the caption to the poster always and to others only once developed', () => {
    const row = { user_id: 'poster', reveal_at: new Date(2000).toISOString(), caption: 'hi' };
    expect(visibleCaption(row, 'poster', 1000)).toBe('hi');
    expect(visibleCaption(row, 'viewer', 1000)).toBeNull();
    expect(visibleCaption(row, 'viewer', 2000)).toBe('hi');
    expect(visibleCaption({ ...row, caption: null }, 'poster', 3000)).toBeNull();
  });

  it('counts caption length as people do and drops blank captions', () => {
    expect(sharedDropCreateBodySchema.safeParse({ ...base, caption: '👨‍👩‍👧'.repeat(100) }).success).toBe(true);
    expect(sharedDropCreateBodySchema.safeParse({ ...base, caption: '👨‍👩‍👧‍👦'.repeat(100) }).success).toBe(true);
    expect(sharedDropCreateBodySchema.safeParse({ ...base, caption: 'a'.repeat(101) }).success).toBe(false);
    expect(sharedDropCreateBodySchema.parse({ ...base, caption: '   ' }).caption).toBeUndefined();
    expect(sharedDropCreateBodySchema.parse({ ...base, caption: ' sunset ' }).caption).toBe('sunset');
  });
});
