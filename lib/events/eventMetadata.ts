import { beaconHeroImageUrl } from "@/lib/ui/beaconHeroImageUrl";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Map pin metadata is jsonb, but some rows still store a JSON string. */
export function parseBeaconMetadata(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

export function metaString(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function instantToIso(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) {
    const ms = Date.parse(raw.trim());
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw > 1e9 ? raw * 1000 : NaN;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    return raw.toISOString();
  }
  return null;
}

/** Prefer first-class `map_beacons` time columns; fall back to metadata helpers. */
export function eventInstantFromRowOrMeta(
  rowValue: unknown,
  metaValue: string | null,
): string | null {
  return instantToIso(rowValue) ?? metaValue;
}

export function eventTitleFromMetadata(meta: Record<string, unknown>): string | null {
  return metaString(meta, "title", "event_title", "label", "name", "track_title", "track_name");
}

export function eventDescriptionFromMetadata(meta: Record<string, unknown>): string | null {
  return metaString(meta, "description", "text", "body", "message");
}

export function eventImageFromMetadata(meta: Record<string, unknown>): string | null {
  return (
    beaconHeroImageUrl(meta) ??
    metaString(meta, "image_url", "cover_url", "album_art_url", "artworkUrl100", "image")
  );
}

export function eventStartAtFromMetadata(meta: Record<string, unknown>): string | null {
  return (
    instantToIso(meta.event_start_at) ??
    instantToIso(meta.eventStartAt) ??
    instantToIso(meta.start_at)
  );
}

export function eventEndAtFromMetadata(meta: Record<string, unknown>): string | null {
  return instantToIso(meta.event_end_at) ?? instantToIso(meta.eventEndAt) ?? instantToIso(meta.end_at);
}

/** IANA name from metadata. Prefer `map_beacons.event_timezone` at read sites. */
export function eventTimezoneFromMetadata(meta: Record<string, unknown>): string | null {
  return metaString(meta, "event_timezone", "eventTimezone");
}

export function eventDisplayTitle(
  title: string | null | undefined,
  locationName?: string | null,
  description?: string | null,
): string {
  const named = title?.trim();
  if (named) return named;
  const place = locationName?.trim();
  if (place) return place;
  const snippet = description?.trim().split("\n")[0]?.slice(0, 80);
  if (snippet) return snippet;
  return "Event";
}

/** Hide a description that merely repeats the title (list + detail). */
export function eventSubtitle(
  title: string | null | undefined,
  description: string | null | undefined,
): string | null {
  const desc = description?.trim() || null;
  if (!desc) return null;
  const named = title?.trim();
  if (named && desc === named) return null;
  return desc;
}

export function eventWhenLabel(when: string | null | undefined): string | null {
  return when?.trim() || null;
}

export function eventWhereLabel(locationName: string | null | undefined): string | null {
  const trimmed = locationName?.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "current location") return "Location shared privately";
  return trimmed;
}

export function eventLocationNameFromMetadata(meta: Record<string, unknown>): string | null {
  return metaString(meta, "location_name", "formatted_address", "address", "place_name");
}

export function rsvpEnabledFromMetadata(meta: Record<string, unknown>): boolean {
  const raw = meta.rsvp_enabled ?? meta.rsvpEnabled;
  if (raw === false || raw === "false") return false;
  return true;
}

export function parseIsoMs(raw: string | null): number | null {
  if (raw == null || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function isUpcomingEvent(meta: Record<string, unknown>, nowMs = Date.now()): boolean {
  const end = parseIsoMs(eventEndAtFromMetadata(meta));
  if (end != null) return end >= nowMs;
  const start = parseIsoMs(eventStartAtFromMetadata(meta));
  if (start != null) return start >= nowMs - 6 * 60 * 60 * 1000;
  return true;
}

export function isEventEnded(meta: Record<string, unknown>, nowMs = Date.now()): boolean {
  const end = parseIsoMs(eventEndAtFromMetadata(meta));
  return end != null && end <= nowMs;
}

/** Whether an event is in the past (end_at, else start_at with a 6h grace). */
export function eventIsPast(
  event: { event_end_at?: string | null; event_start_at?: string | null },
  nowMs = Date.now(),
): boolean {
  const end = parseIsoMs(event.event_end_at ?? null);
  if (end != null) return end < nowMs;
  const start = parseIsoMs(event.event_start_at ?? null);
  if (start != null) return start < nowMs - 6 * 60 * 60 * 1000;
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,18}$/;

export function normalizeGuestContact(raw: string): { contact: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Contact is required" };
  if (EMAIL_RE.test(trimmed)) return { contact: trimmed.toLowerCase() };
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (PHONE_RE.test(trimmed) && digits.replace(/\D/g, "").length >= 7) {
    return { contact: digits.startsWith("+") ? digits : `+${digits.replace(/\D/g, "")}` };
  }
  return { error: "Use an email address or phone number" };
}

export function clientIpFromRequest(request: { headers: Headers }): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export const EVENT_BEACON_UUID_RE = /^[0-9a-fA-F-]{36}$/;
