/** @jest-environment node */

import { matchesFilter, parseEventHistoryFilter, pastEventsPage, recapCardEvent } from '@/lib/events/eventHistory';

const H = 3_600_000;
const NOW = Date.parse('2026-10-05T18:00:00Z');
const rel = (r: Partial<{ went: boolean; rsvpd: boolean; saved: boolean; hosted: boolean }>) => ({
  went: false,
  rsvpd: false,
  saved: false,
  hosted: false,
  ...r,
});
const ev = (id: string, endAgoH: number, relation: ReturnType<typeof rel>) => ({
  beaconId: id,
  startMs: NOW - (endAgoH + 3) * H,
  endMs: NOW - endAgoH * H,
  relation,
});

describe('event history', () => {
  const events = [
    ev('went-recent', 5, rel({ went: true, rsvpd: true })),
    ev('rsvp-only', 30, rel({ rsvpd: true })),
    ev('saved', 100, rel({ saved: true })),
    ev('hosted', 60, rel({ hosted: true })),
    ev('upcoming', -5, rel({ went: true })),
  ];

  it('parses filters, defaulting to all', () => {
    expect(parseEventHistoryFilter('went')).toBe('went');
    expect(parseEventHistoryFilter('bogus')).toBe('all');
    expect(parseEventHistoryFilter(null)).toBe('all');
  });

  it('filters by relation and never lists upcoming events', () => {
    const ids = (f: Parameters<typeof pastEventsPage>[1]) => pastEventsPage(events, f, NOW, null, 50).page.map((e) => e.beaconId);
    expect(ids('all')).toEqual(['went-recent', 'rsvp-only', 'hosted', 'saved']);
    expect(ids('went')).toEqual(['went-recent']);
    expect(ids('rsvpd')).toEqual(['went-recent', 'rsvp-only']);
    expect(ids('saved')).toEqual(['saved']);
    expect(ids('hosted')).toEqual(['hosted']);
    expect(matchesFilter(rel({}), 'all')).toBe(false);
  });

  it('pages by end time', () => {
    const first = pastEventsPage(events, 'all', NOW, null, 2);
    expect(first.page.map((e) => e.beaconId)).toEqual(['went-recent', 'rsvp-only']);
    const second = pastEventsPage(events, 'all', NOW, first.nextCursorEndMs, 2);
    expect(second.page.map((e) => e.beaconId)).toEqual(['hosted', 'saved']);
    expect(second.nextCursorEndMs).toBeNull();
  });

  it('puts only a recent event the user was at (or hosted) on Home', () => {
    expect(recapCardEvent(events, NOW, 48)?.beaconId).toBe('went-recent');
    // RSVP alone doesn't count; older than the window never reaches Home.
    expect(recapCardEvent([ev('rsvp-only', 5, rel({ rsvpd: true }))], NOW, 48)).toBeNull();
    expect(recapCardEvent([ev('old', 49, rel({ went: true }))], NOW, 48)).toBeNull();
    expect(recapCardEvent([ev('hosted', 10, rel({ hosted: true }))], NOW, 48)?.beaconId).toBe('hosted');
  });
});
