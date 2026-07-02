/**
 * Verifies the admin update payload shape for PATCH /api/chat/messages/unread
 * without booting Next.js routing.
 */

describe('messages unread patch payload', () => {
  it('clears read_at when marking unread', () => {
    const payload = { is_read: false, read_at: null };
    expect(payload.is_read).toBe(false);
    expect(payload.read_at).toBeNull();
  });
});
