import {
  EVENT_HUB_ACCESS,
  EVENT_HUB_ARCHIVE_AFTER_REVEAL_MS,
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
  it('archives a day after the Click Drops reveal (10:00 local the morning after)', () => {
    // 7–10 PM in Seattle on Aug 30 → reveal Aug 31 10:00 PDT → archive Sep 1 10:00 PDT.
    const schedule = {
      startEpochMs: Date.parse('2026-08-31T02:00:00.000Z'),
      endEpochMs: Date.parse('2026-08-31T05:00:00.000Z'),
    };
    expect(eventHubExpiresAtIso(schedule, 'America/Los_Angeles')).toBe('2026-09-01T17:00:00.000Z');
    expect(Date.parse(eventHubExpiresAtIso(schedule, 'America/Los_Angeles')) - Date.parse('2026-08-31T17:00:00.000Z'))
      .toBe(EVENT_HUB_ARCHIVE_AFTER_REVEAL_MS);
  });

  it('falls back to UTC for a missing or unknown zone', () => {
    const schedule = { startEpochMs: Date.parse('2026-08-30T18:00:00.000Z'), endEpochMs: Date.parse('2026-08-30T20:00:00.000Z') };
    expect(eventHubExpiresAtIso(schedule, null)).toBe('2026-09-01T10:00:00.000Z');
    expect(eventHubExpiresAtIso(schedule, 'Not/AZone')).toBe('2026-09-01T10:00:00.000Z');
  });
});
