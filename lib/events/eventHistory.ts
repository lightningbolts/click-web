/**
 * F2 — event history. Pure shaping: which past events a user took part in, how, and whether they
 * belong in the Home recap card. Private to the user; other people only ever see events both
 * attended (`eventsTogether`).
 */

export const EVENT_HISTORY_FILTERS = ['all', 'went', 'rsvpd', 'saved', 'hosted'] as const;
export type EventHistoryFilter = (typeof EVENT_HISTORY_FILTERS)[number];

export type EventRelation = { went: boolean; rsvpd: boolean; saved: boolean; hosted: boolean };

export function parseEventHistoryFilter(raw: string | null): EventHistoryFilter {
  return (EVENT_HISTORY_FILTERS as readonly string[]).includes(raw ?? '') ? (raw as EventHistoryFilter) : 'all';
}

export function matchesFilter(relation: EventRelation, filter: EventHistoryFilter): boolean {
  if (filter === 'all') return relation.went || relation.rsvpd || relation.saved || relation.hosted;
  return relation[filter];
}

export type HistoryEvent = { beaconId: string; startMs: number; endMs: number; relation: EventRelation };

/** Past events (ended before now) matching the filter, most recent first, after an end-time cursor. */
export function pastEventsPage<T extends HistoryEvent>(
  events: T[],
  filter: EventHistoryFilter,
  nowMs: number,
  cursorEndMs: number | null,
  limit: number,
): { page: T[]; nextCursorEndMs: number | null } {
  const matching = events
    .filter((e) => e.endMs <= nowMs && matchesFilter(e.relation, filter))
    .filter((e) => cursorEndMs == null || e.endMs < cursorEndMs)
    .sort((a, b) => b.endMs - a.endMs || a.beaconId.localeCompare(b.beaconId));
  const page = matching.slice(0, limit);
  return { page, nextCursorEndMs: matching.length > limit ? page[page.length - 1].endMs : null };
}

/**
 * The single Home recap card: the most recent event the user was at (checked in) or hosted that
 * ended within `windowHours`. Nothing older ever reaches Home.
 */
export function recapCardEvent<T extends HistoryEvent>(events: T[], nowMs: number, windowHours: number): T | null {
  const since = nowMs - windowHours * 3_600_000;
  return (
    events
      .filter((e) => (e.relation.went || e.relation.hosted) && e.endMs <= nowMs && e.endMs > since)
      .sort((a, b) => b.endMs - a.endMs)[0] ?? null
  );
}
