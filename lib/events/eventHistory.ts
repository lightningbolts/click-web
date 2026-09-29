/**
 * F2 — which past events a user took part in and how, and whether one belongs in the Home recap
 * card. Private to the user; others only ever see events both attended (`eventsTogether`). The
 * full history list is `lib/server/history.ts`.
 */

export type EventRelation = { went: boolean; rsvpd: boolean; saved: boolean; hosted: boolean };

export type HistoryEvent = { beaconId: string; startMs: number; endMs: number; relation: EventRelation };

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
