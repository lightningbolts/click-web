/**
 * @jest-environment node
 */

import { resolveChatForTabsParam } from '@/lib/server/resolveChatForTabsParam';

function mockClient(rows: {
  byId?: Record<string, unknown> | null;
  byConnection?: Record<string, unknown> | null;
  byGroup?: Record<string, unknown> | null;
}) {
  return {
    from: (table: string) => {
      expect(table).toBe('chats');
      return {
        select: () => ({
          eq: (column: string, value: string) => ({
            maybeSingle: async () => {
              if (column === 'id') return { data: rows.byId ?? null };
              if (column === 'connection_id') return { data: rows.byConnection ?? null };
              if (column === 'group_id') return { data: rows.byGroup ?? null };
              throw new Error(`unexpected eq ${column}=${value}`);
            },
          }),
        }),
      };
    },
  };
}

describe('resolveChatForTabsParam', () => {
  it('resolves direct chat id', async () => {
    const resolved = await resolveChatForTabsParam(
      mockClient({
        byId: { id: 'chat-1', connection_id: 'conn-1' },
      }),
      'chat-1',
    );
    expect(resolved).toEqual({ chatId: 'chat-1', connectionId: 'conn-1' });
  });

  it('resolves connection id', async () => {
    const resolved = await resolveChatForTabsParam(
      mockClient({
        byId: null,
        byConnection: { id: 'chat-2', connection_id: 'conn-2' },
      }),
      'conn-2',
    );
    expect(resolved).toEqual({ chatId: 'chat-2', connectionId: 'conn-2' });
  });

  it('resolves group id', async () => {
    const resolved = await resolveChatForTabsParam(
      mockClient({
        byId: null,
        byConnection: null,
        byGroup: { id: 'chat-g', connection_id: null, group_id: 'group-9' },
      }),
      'group-9',
    );
    expect(resolved).toEqual({ chatId: 'chat-g', connectionId: null });
  });

  it('returns null when nothing matches', async () => {
    const resolved = await resolveChatForTabsParam(
      mockClient({ byId: null, byConnection: null, byGroup: null }),
      'missing',
    );
    expect(resolved).toBeNull();
  });
});
