import { buildMessageInsertRow, normalizeDbMessage, parseLocalSentAtMs } from '@/lib/chat/messages';

describe('parseLocalSentAtMs', () => {
  it('returns null for non-numbers', () => {
    expect(parseLocalSentAtMs(undefined)).toBeNull();
    expect(parseLocalSentAtMs('x')).toBeNull();
    expect(parseLocalSentAtMs(null)).toBeNull();
  });

  it('rejects negative and absurd magnitudes', () => {
    expect(parseLocalSentAtMs(-1)).toBeNull();
    expect(parseLocalSentAtMs(2e15)).toBeNull();
  });

  it('truncates finite positive values', () => {
    expect(parseLocalSentAtMs(1_700_000_000_000.9)).toBe(1_700_000_000_000);
  });
});

describe('buildMessageInsertRow', () => {
  it('omits local_sent_at when null', () => {
    const row = buildMessageInsertRow({
      chatId: 'c1',
      userId: 'u1',
      content: 'hi',
      now: 100,
      localSentAtMs: null,
    });
    expect(row.local_sent_at).toBeUndefined();
  });

  it('includes local_sent_at when provided', () => {
    const row = buildMessageInsertRow({
      chatId: 'c1',
      userId: 'u1',
      content: 'e2e:opaque',
      now: 200,
      localSentAtMs: 199,
    });
    expect(row.local_sent_at).toBe(199);
    expect(row.content).toBe('e2e:opaque');
  });
});

describe('normalizeDbMessage', () => {
  it('maps local_sent_at and read_at with safe defaults', () => {
    const m = normalizeDbMessage({
      id: 'm1',
      chat_id: 'c1',
      user_id: 'u1',
      content: 'x',
      time_created: 50,
      time_edited: null,
      is_read: false,
      local_sent_at: 40,
      read_at: 60,
      message_type: 'text',
      metadata: {},
    });
    expect(m.local_sent_at).toBe(40);
    expect(m.read_at).toBe(60);
    expect(m.time_created).toBe(50);
  });

  it('treats invalid timestamps as null', () => {
    const m = normalizeDbMessage({
      id: 'm1',
      chat_id: 'c1',
      user_id: 'u1',
      content: '',
      time_created: 1,
      is_read: true,
      local_sent_at: 'nope',
      read_at: Number.NaN,
      message_type: 'text',
      metadata: {},
    });
    expect(m.local_sent_at).toBeNull();
    expect(m.read_at).toBeNull();
  });

  it('maps delivered_at when finite', () => {
    const m = normalizeDbMessage({
      id: 'm1',
      chat_id: 'c1',
      user_id: 'u1',
      content: '',
      time_created: 1,
      is_read: false,
      delivered_at: 900,
      message_type: 'text',
      metadata: {},
    });
    expect(m.delivered_at).toBe(900);
  });
});
