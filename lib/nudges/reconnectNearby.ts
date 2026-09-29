/**
 * F6 — "You met {name} near here in {month}". Pure selection: given where the viewer is (coarse),
 * their connections' past encounters and what they've already been shown, pick at most one. The
 * copy only recalls the past meeting; it never says where anyone is now.
 */

export type ReconnectConfig = {
  radiusMeters: number;
  minAgeDays: number;
  cooldownDays: number;
  frequentPlaceDays: number;
  frequentWindowDays: number;
};

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  radiusMeters: 100,
  minAgeDays: 14,
  cooldownDays: 30,
  frequentPlaceDays: 5,
  frequentWindowDays: 90,
};

const DAY_MS = 86_400_000;

/** ~100 m: three decimal places. The server re-rounds whatever the client sends. */
export function coarsen(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A muted place's key: the ~100 m cell it falls in. */
export function placeCell(lat: number, lng: number): string {
  return `${coarsen(lat).toFixed(3)},${coarsen(lng).toFixed(3)}`;
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export type PeerEncounter = {
  encounterId: string;
  connectionId: string;
  peerId: string;
  atMs: number;
  lat: number;
  lng: number;
  placeName: string | null;
};

export type ShownNudge = { connectionId: string; shownAtMs: number; dismissed: boolean };

export type ReconnectPick = { encounter: PeerEncounter; distanceMeters: number };

export function pickReconnectNudge(input: {
  here: { lat: number; lng: number };
  nowMs: number;
  /** Every encounter the viewer has with their active connections (any age, any place). */
  encounters: PeerEncounter[];
  /** Nudges already shown to the viewer (recent ones are enough). */
  shown: ShownNudge[];
  mutedPeople: ReadonlySet<string>;
  mutedPlaces: ReadonlySet<string>;
  config: ReconnectConfig;
}): ReconnectPick | null {
  const { here, nowMs, config } = input;

  // One a day: a nudge already shown today stands in for any new pick.
  if (input.shown.some((s) => nowMs - s.shownAtMs < DAY_MS)) return null;

  if (input.mutedPlaces.has(placeCell(here.lat, here.lng))) return null;

  const near = input.encounters
    .map((e) => ({ encounter: e, distanceMeters: distanceMeters(here, e) }))
    .filter((c) => c.distanceMeters <= config.radiusMeters);

  // A place you're at all the time (home, dorm, your usual classroom) isn't a reminder.
  const windowStart = nowMs - config.frequentWindowDays * DAY_MS;
  const daysHere = new Set(near.filter((c) => c.encounter.atMs >= windowStart).map((c) => Math.floor(c.encounter.atMs / DAY_MS)));
  if (daysHere.size >= config.frequentPlaceDays) return null;

  const cooldownStart = nowMs - config.cooldownDays * DAY_MS;
  const cooling = new Set(input.shown.filter((s) => s.shownAtMs >= cooldownStart).map((s) => s.connectionId));
  // Met anyone this recently, anywhere, and they're already in touch — no reminder needed.
  const recentlyMet = new Set(
    input.encounters.filter((e) => nowMs - e.atMs < config.minAgeDays * DAY_MS).map((e) => e.connectionId),
  );

  const candidates = near.filter(
    (c) =>
      nowMs - c.encounter.atMs >= config.minAgeDays * DAY_MS &&
      !recentlyMet.has(c.encounter.connectionId) &&
      !cooling.has(c.encounter.connectionId) &&
      !input.mutedPeople.has(c.encounter.peerId) &&
      !input.mutedPlaces.has(placeCell(c.encounter.lat, c.encounter.lng)),
  );
  // Closest meeting place first, then the most recent meeting there.
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters || b.encounter.atMs - a.encounter.atMs);
  return candidates[0] ?? null;
}

/** "You met Maya near here in June" (plus the year when it wasn't this year). */
export function reconnectNearbyCopy(peerFirstName: string, metAtMs: number, nowMs: number, timeZone = 'UTC'): {
  title: string;
  body: string;
} {
  const name = peerFirstName.trim() || 'someone';
  const met = new Date(metAtMs);
  const sameYear = met.getUTCFullYear() === new Date(nowMs).getUTCFullYear();
  const when = new Intl.DateTimeFormat('en-US', { month: 'long', ...(sameYear ? {} : { year: 'numeric' }), timeZone }).format(met);
  return { title: `You met ${name} near here`, body: `You met ${name} near here in ${when}. Say hi?` };
}
