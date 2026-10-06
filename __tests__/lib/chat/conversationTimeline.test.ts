import {
  buildTimelineEntries,
  formatConversationDayLabel,
  getDayStart,
  messageRuns,
} from '@/lib/chat/conversationTimeline';
import type { Message } from '@/lib/chat/types';

function msg(id: string, timeCreated: number): Message {
  return {
    id,
    chat_id: 'chat-1',
    user_id: 'user-1',
    content: `message ${id}`,
    time_created: timeCreated,
    time_edited: null,
    is_read: false,
    read_at: null,
    delivered_at: null,
    message_type: 'text',
    metadata: {},
    reactions: {},
  } as Message;
}

describe('conversationTimeline helpers (moved verbatim from ChatView)', () => {
  it('getDayStart truncates to local midnight', () => {
    const noon = new Date(2026, 4, 5, 12, 34, 56).getTime();
    expect(getDayStart(noon)).toBe(new Date(2026, 4, 5, 0, 0, 0, 0).getTime());
  });

  it('formatConversationDayLabel labels today and yesterday', () => {
    const now = Date.now();
    expect(formatConversationDayLabel(now)).toBe('Today');
    expect(formatConversationDayLabel(now - 24 * 60 * 60 * 1000)).toBe('Yesterday');
  });

  it('formatConversationDayLabel formats older days with date and time', () => {
    const old = new Date(2026, 0, 2, 9, 5).getTime();
    const label = formatConversationDayLabel(old);
    expect(label).toContain('January');
    expect(label).toContain(' at ');
  });

  it('buildTimelineEntries inserts a separator per day change', () => {
    const dayA = new Date(2026, 2, 1, 10, 0).getTime();
    const dayB = new Date(2026, 2, 2, 8, 0).getTime();
    const entries = buildTimelineEntries([
      msg('1', dayA),
      msg('2', dayA + 60_000),
      msg('3', dayB),
    ]);
    expect(entries.map((e) => e.kind)).toEqual([
      'separator',
      'message',
      'message',
      'separator',
      'message',
    ]);
    expect(entries[0]).toMatchObject({ key: `separator-${getDayStart(dayA)}` });
  });

  it('buildTimelineEntries returns empty for no messages', () => {
    expect(buildTimelineEntries([])).toEqual([]);
  });
});

describe('messageRuns', () => {
  const base = new Date(2026, 9, 6, 12, 0, 0).getTime();
  const from = (id: string, user: string, offsetMin: number, type: Message['message_type'] = 'text'): Message => ({
    ...msg(id, base + offsetMin * 60_000),
    user_id: user,
    message_type: type,
  });

  it('groups consecutive messages from one sender', () => {
    const runs = messageRuns([from('a', 'u1', 0), from('b', 'u1', 1), from('c', 'u1', 2), from('d', 'u2', 3)]);
    expect(runs.get('a')).toEqual({ first: true, last: false });
    expect(runs.get('b')).toEqual({ first: false, last: false });
    expect(runs.get('c')).toEqual({ first: false, last: true });
    expect(runs.get('d')).toEqual({ first: true, last: true });
  });

  it('breaks runs on long gaps and call logs', () => {
    const runs = messageRuns([from('a', 'u1', 0), from('b', 'u1', 10), from('c', 'u1', 11, 'call_log'), from('d', 'u1', 12)]);
    expect(runs.get('a')).toEqual({ first: true, last: true });
    expect(runs.get('b')).toEqual({ first: true, last: true });
    expect(runs.get('c')).toEqual({ first: true, last: true });
    expect(runs.get('d')).toEqual({ first: true, last: true });
  });
});
