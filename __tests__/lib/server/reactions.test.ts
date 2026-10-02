/** @jest-environment node */

jest.mock('server-only', () => ({}));
const mockPeers = jest.fn();
jest.mock('@/lib/server/connections/viewerPeers', () => ({ loadViewerPeers: (...a: unknown[]) => mockPeers(...a) }));

import { loadReactions } from '@/lib/server/reactions';

const rows = [
  { user_id: 'friend', emoji: '🔥' },
  { user_id: 'stranger', emoji: '😂' },
  { user_id: 'me', emoji: '❤️' },
];
const admin = {
  from: (table: string) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) c[m] = () => c;
    const data = table === 'reactions' ? rows : [{ id: 'friend', name: 'Maya' }, { id: 'stranger', name: 'Sam' }];
    c.then = (r: (v: unknown) => unknown) => Promise.resolve(r({ data, error: null }));
    return c;
  },
};

describe('loadReactions', () => {
  beforeEach(() => mockPeers.mockResolvedValue(new Map([['friend', {}]])));

  it('shows a viewer their own reaction and their connections', async () => {
    const out = await loadReactions(admin as never, 'shared_drop', 'd', 'me', 'poster');
    expect(out.mine).toBe('❤️');
    expect(out.reactions.map((r) => r.user_id)).toEqual(['friend']);
  });

  it('shows the owner everyone', async () => {
    const out = await loadReactions(admin as never, 'shared_drop', 'd', 'poster', 'poster');
    expect(out.is_owner).toBe(true);
    expect(out.reactions.map((r) => r.user_id)).toEqual(['friend', 'stranger', 'me']);
  });
});
