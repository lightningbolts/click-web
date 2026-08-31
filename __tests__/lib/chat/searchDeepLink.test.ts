import { highlightedMessageSnippet, escapeIlikePattern, mergeChatSearchHits } from '@/lib/chat/searchSnippet';
import { mergeAroundTargetMessages } from '@/lib/chat/aroundMessage';

describe('highlightedMessageSnippet', () => {
  it('keeps the query in a compact window', () => {
    const snippet = highlightedMessageSnippet(
      'hello there, the blue notebook is on the desk near the window',
      'notebook',
    );
    expect(snippet.toLowerCase()).toContain('notebook');
    expect(snippet.length).toBeLessThanOrEqual(140);
  });
});

describe('mergeAroundTargetMessages', () => {
  it('dedupes the target across older and newer pages', () => {
    const target = { id: 'm2' };
    const merged = mergeAroundTargetMessages([{ id: 'm1' }, target], [{ id: 'm3' }], target);
    expect(merged.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('escapeIlikePattern', () => {
  it('escapes wildcard characters', () => {
    expect(escapeIlikePattern('100%_off\\now')).toBe('100\\%\\_off\\\\now');
  });
});

describe('mergeChatSearchHits', () => {
  it('dedupes by messageId and sorts newest first', () => {
    const merged = mergeChatSearchHits(
      [
        {
          messageId: 'a',
          chatId: 'c1',
          conversationId: 'c1',
          connectionId: 'c1',
          senderId: 'u1',
          timestamp: 10,
          snippet: 'old',
          chatName: 'Ann',
          isHub: false,
        },
      ],
      [
        {
          messageId: 'b',
          chatId: 'c2',
          conversationId: 'c2',
          connectionId: 'c2',
          senderId: 'u2',
          timestamp: 20,
          snippet: 'new',
          chatName: 'Bob',
          isHub: false,
        },
        {
          messageId: 'a',
          chatId: 'c1',
          conversationId: 'c1',
          connectionId: 'c1',
          senderId: 'u1',
          timestamp: 10,
          snippet: 'old-updated',
          chatName: 'Ann',
          isHub: false,
        },
      ],
    );
    expect(merged.map((h) => h.messageId)).toEqual(['b', 'a']);
    expect(merged[1].snippet).toBe('old-updated');
  });
});
