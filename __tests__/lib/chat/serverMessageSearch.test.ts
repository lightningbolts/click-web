import { chunkIds, selectInChunks } from '@/lib/chat/postgrestInChunks';
import { toDirectChatSearchHit, toHubChatSearchHit } from '@/lib/chat/serverMessageSearch';

describe('chunkIds', () => {
  it('drops blanks and chunks unique ids', () => {
    const ids = Array.from({ length: 90 }, (_, i) => `id-${i}`);
    ids.push('', 'id-0', '  ');
    const chunks = chunkIds(ids, 80);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(80);
    expect(chunks[1]).toHaveLength(10);
  });
});

describe('selectInChunks', () => {
  it('concatenates each chunk load', async () => {
    const rows = await selectInChunks(
      ['a', 'b', 'c', 'a'],
      async (chunk) => chunk.map((id) => ({ id })),
      2,
    );
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('server message search hits', () => {
  it('maps 1:1 rows onto conversation ids', () => {
    const hit = toDirectChatSearchHit({
      messageId: 'm1',
      chat: { id: 'chat-1', connection_id: 'conn-1', group_id: null },
      senderId: 'u1',
      timestamp: 99,
      content: 'hello there notebook',
      query: 'notebook',
      chatName: 'Ann',
    });
    expect(hit.connectionId).toBe('conn-1');
    expect(hit.conversationId).toBe('conn-1');
    expect(hit.isHub).toBe(false);
    expect(hit.snippet.toLowerCase()).toContain('notebook');
  });

  it('attaches hub realtime channel for deep links', () => {
    const hit = toHubChatSearchHit({
      messageId: 'hm1',
      hubId: 'hub_abc',
      senderId: 'u2',
      createdAt: '2026-08-18T00:00:00.000Z',
      body: 'welcome to the lobby',
      query: 'lobby',
      chatName: 'Lobby',
    });
    expect(hit.isHub).toBe(true);
    expect(hit.hubId).toBe('hub_abc');
    expect(hit.hubRealtimeChannel).toBe('hub:hub_abc');
    expect(hit.snippet.toLowerCase()).toContain('lobby');
  });
});
