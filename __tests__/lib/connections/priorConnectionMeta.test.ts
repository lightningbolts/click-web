import { knownSinceLabel, isKnownSinceBucket, PRIOR_CONNECTION_BADGE_LABEL } from '@/lib/connections/priorConnectionMeta';

describe('priorConnectionMeta', () => {
  it('maps known-since buckets to UI labels', () => {
    expect(isKnownSinceBucket('college')).toBe(true);
    expect(isKnownSinceBucket('alumni')).toBe(false);
    expect(knownSinceLabel('high_school')).toBe('High School');
    expect(knownSinceLabel('nope')).toBe('Unspecified');
    expect(PRIOR_CONNECTION_BADGE_LABEL).toBe('Prior Connection · Self-Reported');
  });
});
