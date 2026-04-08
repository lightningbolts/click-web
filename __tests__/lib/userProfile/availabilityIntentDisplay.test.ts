import { humanizeAvailabilityTimeframe } from '@/lib/userProfile/availabilityIntentDisplay';

describe('humanizeAvailabilityTimeframe', () => {
  it('formats ~24h ISO interval as Next 24h', () => {
    expect(
      humanizeAvailabilityTimeframe(
        '2026-04-08T18:00:00.000Z/2026-04-09T18:00:00.000Z',
      ),
    ).toBe('Next 24h');
  });

  it('formats other intervals as Until {end date}', () => {
    expect(
      humanizeAvailabilityTimeframe(
        '2026-04-08T12:00:00.000Z/2026-04-08T15:00:00.000Z',
      ),
    ).toBe('Until Apr 8');
  });

  it('falls back to title-cased legacy tokens', () => {
    expect(humanizeAvailabilityTimeframe('this_week')).toBe('This Week');
  });
});
