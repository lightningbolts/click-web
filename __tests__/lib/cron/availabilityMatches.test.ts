import { findAvailabilityMatches } from '@/lib/cron/availabilityMatches';

describe('findAvailabilityMatches', () => {
  const connections = [
    {
      id: 'conn-1',
      user_ids: ['user-a', 'user-b'],
      should_continue: [true, true],
      expiry_state: 'kept',
      status: 'active',
    },
  ];

  it('matches overlapping tag + timeframe on a mutually kept connection', () => {
    const matches = findAvailabilityMatches({
      connections,
      intents: [
        {
          id: 'int-1',
          user_id: 'user-a',
          intent_tag: 'Coffee',
          timeframe: '2026-08-13T14:00:00.000Z/2026-08-13T16:00:00.000Z',
          expires_at: '2026-08-13T16:00:00.000Z',
        },
        {
          id: 'int-2',
          user_id: 'user-b',
          intent_tag: 'coffee',
          timeframe: '2026-08-13T15:00:00.000Z/2026-08-13T17:00:00.000Z',
          expires_at: '2026-08-13T17:00:00.000Z',
        },
      ],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].connection_id).toBe('conn-1');
    expect(matches[0].intent_tag.toLowerCase()).toBe('coffee');
  });

  it('ignores non-overlapping timeframes', () => {
    const matches = findAvailabilityMatches({
      connections,
      intents: [
        {
          id: 'int-1',
          user_id: 'user-a',
          intent_tag: 'Coffee',
          timeframe: '2026-08-13T14:00:00.000Z/2026-08-13T15:00:00.000Z',
          expires_at: '2026-08-13T15:00:00.000Z',
        },
        {
          id: 'int-2',
          user_id: 'user-b',
          intent_tag: 'Coffee',
          timeframe: '2026-08-13T16:00:00.000Z/2026-08-13T17:00:00.000Z',
          expires_at: '2026-08-13T17:00:00.000Z',
        },
      ],
    });
    expect(matches).toEqual([]);
  });
});
