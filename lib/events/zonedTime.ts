/**
 * Wall-clock ↔ instant conversion in an explicit IANA zone, so the event form can edit
 * "6:00 PM in America/New_York" from a browser anywhere (spec §7.6.3 Timezone row).
 */
export type WallClock = { date: string; time: string };

const pad = (n: number) => String(n).padStart(2, "0");

function parts(ms: number, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Zone offset (ms, east positive) at an instant. */
function offsetAt(ms: number, timeZone: string): number {
  const p = parts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

export function wallClockInZone(iso: string | Date, timeZone: string): WallClock {
  const p = parts(typeof iso === "string" ? Date.parse(iso) : iso.getTime(), timeZone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/**
 * The instant a wall clock names in `timeZone`. In a spring-forward gap the time is moved
 * forward by the gap (2:30 → 3:30), the way calendars resolve it; in a fall-back overlap
 * the earlier instant wins.
 */
export function instantFromWallClock({ date, time }: WallClock, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const asUtc = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  const first = asUtc - offsetAt(asUtc, timeZone);
  const second = asUtc - offsetAt(first, timeZone);
  // Prefer the earlier of the two candidates that actually shows this wall clock.
  const candidates = [Math.min(first, second), Math.max(first, second)];
  for (const c of candidates) {
    const w = wallClockInZone(new Date(c), timeZone);
    if (w.date === date && w.time === time) return new Date(c);
  }
  return new Date(Math.max(first, second));
}

/** "PDT", "GMT+2"… for a zone at an instant. */
export function zoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? timeZone
    );
  } catch {
    return timeZone;
  }
}

/** Every IANA zone the runtime knows, with the given zone guaranteed present. */
export function timeZoneOptions(include: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  return zones.includes(include) ? zones : [include, ...zones];
}
