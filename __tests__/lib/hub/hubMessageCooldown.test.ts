import {
  checkHubMessageCooldown,
  HUB_MESSAGE_COOLDOWN_SECONDS,
} from '@/lib/hub/hubMessageCooldown';

describe('hub message cooldown', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');

  it('allows send when user has no prior message', () => {
    expect(checkHubMessageCooldown(null, now)).toEqual({ allowed: true });
    expect(checkHubMessageCooldown(undefined, now)).toEqual({ allowed: true });
    expect(checkHubMessageCooldown('', now)).toEqual({ allowed: true });
  });

  it('allows send when cooldown window has elapsed', () => {
    const last = new Date(now - HUB_MESSAGE_COOLDOWN_SECONDS * 1000).toISOString();
    expect(checkHubMessageCooldown(last, now)).toEqual({ allowed: true });
  });

  it('blocks send inside the cooldown window with retry_after_seconds', () => {
    const last = new Date(now - 5_000).toISOString();
    const result = checkHubMessageCooldown(last, now);
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 10 });
  });

  it('ceilings partial seconds', () => {
    const last = new Date(now - 14_100).toISOString();
    const result = checkHubMessageCooldown(last, now);
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('treats invalid timestamps as allowed', () => {
    expect(checkHubMessageCooldown('not-a-date', now)).toEqual({ allowed: true });
  });
});
