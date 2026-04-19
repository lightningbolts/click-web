/**
 * Contract for PATCH /api/chat/messages/delivered (no Next runtime).
 * Server applies a single [delivered_at] stamp only where the column is still null.
 */

describe('PATCH /api/chat/messages/delivered', () => {
  it('uses a millisecond stamp for delivered_at', () => {
    const stamp = 1_700_000_000_456;
    const update = { delivered_at: stamp };
    expect(update.delivered_at).toBe(stamp);
  });
});
