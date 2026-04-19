/**
 * Contract tests for POST /api/chat/messages (no Next.js runtime).
 * Keeps insert payload rules explicit for E2EE + local clock fields.
 */

import { buildMessageInsertRow, parseLocalSentAtMs } from '@/lib/chat/messages';

describe('POST /api/chat/messages insert contract', () => {
  it('preserves e2ee ciphertext while attaching local_sent_at', () => {
    const localMs = 1_700_000_000_321;
    const row = buildMessageInsertRow({
      chatId: 'chat-1',
      userId: 'user-1',
      content: 'e2e:v1:opaque',
      now: 1_700_000_000_400,
      localSentAtMs: parseLocalSentAtMs(localMs),
    });
    expect(row.content.startsWith('e2e:')).toBe(true);
    expect(row.local_sent_at).toBe(localMs);
  });

  it('omits local_sent_at when the client value is invalid', () => {
    const row = buildMessageInsertRow({
      chatId: 'chat-1',
      userId: 'user-1',
      content: 'plain',
      now: 100,
      localSentAtMs: parseLocalSentAtMs(-5),
    });
    expect(row.local_sent_at).toBeUndefined();
  });
});
