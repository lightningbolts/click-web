/** @jest-environment node */

jest.mock('server-only', () => ({}));

import {
  configNumber,
  isFlagOnForUser,
  resetFeatureFlagCache,
  resolveFeature,
  rolloutBucket,
  type FeatureFlagRow,
} from '@/lib/server/featureFlags';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function row(overrides: Partial<FeatureFlagRow> = {}): FeatureFlagRow {
  return { key: 'drops_develop', enabled: true, rollout_percent: 0, allow_user_ids: [], config: {}, ...overrides };
}

describe('feature flags', () => {
  beforeEach(() => resetFeatureFlagCache());

  it('buckets users stably within 0-99', () => {
    const bucket = rolloutBucket('drops_develop', USER);
    expect(bucket).toBe(rolloutBucket('drops_develop', USER));
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
  });

  it('is off when missing or disabled, even for allow-listed users', () => {
    expect(isFlagOnForUser(undefined, USER)).toBe(false);
    expect(isFlagOnForUser(row({ enabled: false, rollout_percent: 100, allow_user_ids: [USER] }), USER)).toBe(false);
  });

  it('is on for allow-listed users and by rollout percentage', () => {
    expect(isFlagOnForUser(row({ allow_user_ids: [USER] }), USER)).toBe(true);
    expect(isFlagOnForUser(row({ rollout_percent: 100 }), USER)).toBe(true);
    expect(isFlagOnForUser(row({ rollout_percent: 0 }), USER)).toBe(false);
    const bucket = rolloutBucket('drops_develop', USER);
    expect(isFlagOnForUser(row({ rollout_percent: bucket + 1 }), USER)).toBe(true);
    expect(isFlagOnForUser(row({ rollout_percent: bucket }), USER)).toBe(false);
  });

  it('reads config numbers within bounds, else the default', () => {
    const config = { ttl: 90, bad: 'x', huge: 10_000, str: '45' };
    expect(configNumber(config, 'ttl', 120, { min: 1, max: 1000 })).toBe(90);
    expect(configNumber(config, 'str', 120, { min: 1, max: 1000 })).toBe(45);
    expect(configNumber(config, 'bad', 120, { min: 1, max: 1000 })).toBe(120);
    expect(configNumber(config, 'huge', 120, { min: 1, max: 1000 })).toBe(120);
    expect(configNumber(config, 'missing', 120, { min: 1, max: 1000 })).toBe(120);
  });

  it('fails closed when the table cannot be read', async () => {
    const admin = {
      from: () => ({ select: async () => ({ data: null, error: { message: 'boom' } }) }),
    };
    const feature = await resolveFeature(admin as never, 'drops_develop', USER);
    expect(feature).toEqual({ enabled: false, config: {} });
  });
});
