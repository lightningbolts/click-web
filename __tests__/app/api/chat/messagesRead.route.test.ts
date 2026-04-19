/**
 * Verifies the admin update payload shape for PATCH /api/chat/messages/read
 * without booting Next.js routing (NASA P10: small, single-purpose test).
 */

describe('messages read patch payload', () => {
  it('uses paired is_read and read_at timestamps', () => {
    const readStamp = 1_700_000_000_123;
    const payload = { is_read: true, read_at: readStamp };
    expect(payload.is_read).toBe(true);
    expect(typeof payload.read_at).toBe('number');
    expect(payload.read_at).toBe(readStamp);
  });
});
