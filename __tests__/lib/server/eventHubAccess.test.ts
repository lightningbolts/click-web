import {
  EVENT_HUB_ACCESS,
  EVENT_HUB_TTL_AFTER_END_MS,
  evaluateEventHubAccess,
  eventHubExpiresAtIso,
} from '@/lib/server/eventHubAccess';

describe('evaluateEventHubAccess', () => {
  const guest = {
    userId: 'guest',
    hubCreatorId: 'host',
    eventCreatorId: 'host',
    hasActiveCheckIn: false,
    hasRsvp: false,
  };

  it('allows the hub creator without check-in', () => {
    expect(
      evaluateEventHubAccess({
        ...guest,
        userId: 'host',
      }),
    ).toBe(true);
  });

  it('allows the event creator even when hub creator differs', () => {
    expect(
      evaluateEventHubAccess({
        ...guest,
        userId: 'event-host',
        eventCreatorId: 'event-host',
      }),
    ).toBe(true);
  });

  it('allows a checked-in guest when requireRsvp is false', () => {
    expect(
      evaluateEventHubAccess({
        ...guest,
        hasActiveCheckIn: true,
      }),
    ).toBe(true);
  });

  it('denies RSVP-only guests while requireRsvp is false', () => {
    expect(
      evaluateEventHubAccess({
        ...guest,
        hasRsvp: true,
      }),
    ).toBe(false);
  });

  it('requires both check-in and RSVP when the flag is flipped', () => {
    const policy = { requireCheckIn: true, requireRsvp: true };
    expect(
      evaluateEventHubAccess({
        ...guest,
        hasActiveCheckIn: true,
        policy,
      }),
    ).toBe(false);
    expect(
      evaluateEventHubAccess({
        ...guest,
        hasActiveCheckIn: true,
        hasRsvp: true,
        policy,
      }),
    ).toBe(true);
  });

  it('keeps requireRsvp off in the shipped policy', () => {
    expect(EVENT_HUB_ACCESS.requireCheckIn).toBe(true);
    expect(EVENT_HUB_ACCESS.requireRsvp).toBe(false);
  });
});

describe('eventHubExpiresAtIso', () => {
  it('is 24 hours after event end', () => {
    const end = Date.parse('2026-08-30T20:00:00.000Z');
    expect(eventHubExpiresAtIso(end)).toBe(
      new Date(end + EVENT_HUB_TTL_AFTER_END_MS).toISOString(),
    );
  });
});
