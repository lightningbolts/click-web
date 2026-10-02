/** @jest-environment node */

jest.mock('server-only', () => ({}));

import { loadViewerPeers } from '@/lib/server/connections/viewerPeers';

const ME = 'me';

function admin(tables: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      const result = { data: tables[table] ?? [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'contains']) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result));
      return chain;
    },
  };
}

describe('loadViewerPeers', () => {
  it('keeps active connections and drops archived, hidden, blocked and inactive ones', async () => {
    const peers = await loadViewerPeers(
      admin({
        connections: [
          { id: 'c-active', user_ids: [ME, 'ana'], status: 'active' },
          { id: 'c-core', user_ids: [ME, 'ben'], status: 'kept' },
          { id: 'c-archived', user_ids: [ME, 'cal'], status: 'active' },
          { id: 'c-hidden', user_ids: [ME, 'dee'], status: 'active' },
          { id: 'c-removed', user_ids: [ME, 'eli'], status: 'removed' },
          { id: 'c-blocked', user_ids: [ME, 'fay'], status: 'active' },
          { id: 'c-blocker', user_ids: [ME, 'gus'], status: 'active' },
        ],
        connection_archives: [{ connection_id: 'c-archived' }],
        connection_hidden: [{ connection_id: 'c-hidden' }],
        connection_core: [{ connection_id: 'c-core' }],
        // The mock answers both block directions with the same rows.
        user_blocks: [{ blocked_id: 'fay', blocker_id: 'gus' }],
      }) as never,
      ME,
    );
    expect([...peers.keys()].sort()).toEqual(['ana', 'ben']);
    expect(peers.get('ben')?.isCore).toBe(true);
    expect(peers.get('ana')?.isCore).toBe(false);
  });
});
