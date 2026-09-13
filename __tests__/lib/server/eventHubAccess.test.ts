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

  it('allows the hub creator without RSVP or check-in', () => {
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

  it('allows an RSVP member before check-in', () => {
    expect(
      evaluateEventHubAccess({
        ...guest,
        hasRsvp: true,
      }),
    ).toBe(true);
  });

  it('denies check-in-only guests under the shipped RSVP policy', () => {
    expect(
      evaluateEventHubAccess({
        ...guest,
        hasActiveCheckIn: true,
      }),
    ).toBe(false);
  });

  it('can still model a stricter check-in plus RSVP event', () => {
    const policy = { requireCheckIn: true, requireRsvp: true };
    expect(
      evaluateEventHubAccess({
        ...guest,
        hasRsvp: true,
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

  it('ships RSVP access without requiring physical check-in', () => {
    expect(EVENT_HUB_ACCESS.requireCheckIn).toBe(false);
    expect(EVENT_HUB_ACCESS.requireRsvp).toBe(true);
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
