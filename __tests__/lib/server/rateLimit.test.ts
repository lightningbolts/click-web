/**
 * @jest-environment node
 */

import {
  CONNECTIONS_RATE_LIMIT_BINDING,
  READ_HEAVY_RATE_LIMIT_BINDING,
  isRateLimited,
} from '@/lib/server/rateLimit';

describe('isRateLimited (memory fallback)', () => {
  const key = `test-${Date.now()}-${Math.random()}`;

  it('allows requests under the limit then blocks', async () => {
    const limit = 3;
    const windowMs = 60_000;
    for (let i = 0; i < limit; i++) {
      await expect(
        isRateLimited({
          bindingName: CONNECTIONS_RATE_LIMIT_BINDING,
          key,
          limit,
          windowMs,
        }),
      ).resolves.toBe(false);
    }
    await expect(
      isRateLimited({
        bindingName: CONNECTIONS_RATE_LIMIT_BINDING,
        key,
        limit,
        windowMs,
      }),
    ).resolves.toBe(true);
  });

  it('isolates buckets by binding name', async () => {
    const otherKey = `${key}-other`;
    await expect(
      isRateLimited({
        bindingName: READ_HEAVY_RATE_LIMIT_BINDING,
        key: otherKey,
        limit: 1,
        windowMs: 60_000,
      }),
    ).resolves.toBe(false);
    await expect(
      isRateLimited({
        bindingName: READ_HEAVY_RATE_LIMIT_BINDING,
        key: otherKey,
        limit: 1,
        windowMs: 60_000,
      }),
    ).resolves.toBe(true);
  });
});
