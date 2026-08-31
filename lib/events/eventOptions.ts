import type { BeaconVisibilityAudience } from "@/lib/map/beaconVisibility";
import { isRecord, metaString } from "@/lib/events/eventMetadata";

export type EventVisibility = "public" | "unlisted" | "invite_only";
export type GuestListVisibility = "public" | "hosts_only";
export type EventRsvpRequestStatus = "pending" | "approved" | "denied" | "waitlisted";

export type EventListingOptions = {
  event_visibility: EventVisibility;
  event_capacity: number | null;
  approval_required: boolean;
  guest_list_visibility: GuestListVisibility;
  cover_theme_id: string | null;
};

export const EVENT_COVER_THEME_IDS = [
  "theme:purple",
  "theme:teal",
  "theme:coral",
  "theme:gold",
  "theme:magenta",
] as const;

export const EVENT_CATEGORY_OPTIONS = [
  "Social",
  "School Event",
  "Networking",
  "Music",
  "Arts",
  "Sports",
  "Food & Drink",
  "Nightlife",
  "Outdoors",
  "Wellness",
  "Tech",
  "Workshop",
  "Volunteering",
  "Community",
  "Promotional",
] as const;

export const DEFAULT_EVENT_LISTING_OPTIONS: EventListingOptions = {
  event_visibility: "public",
  event_capacity: null,
  approval_required: false,
  guest_list_visibility: "public",
  cover_theme_id: null,
};

export function parseEventVisibility(raw: unknown): EventVisibility {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "unlisted") return "unlisted";
  if (v === "invite_only" || v === "invite-only" || v === "inviteonly") return "invite_only";
  return "public";
}

export function parseGuestListVisibility(raw: unknown): GuestListVisibility {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "hosts_only" || v === "hosts-only" || v === "hostsonly") return "hosts_only";
  return "public";
}

export function parseEventCapacity(raw: unknown): number | null {
  if (raw == null || raw === "" || raw === false) return null;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function parseApprovalRequired(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

export function parseCoverThemeId(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  return (EVENT_COVER_THEME_IDS as readonly string[]).includes(v) ? v : v.startsWith("theme:") ? v : null;
}

export function eventVisibilityToMapAudience(visibility: EventVisibility): BeaconVisibilityAudience {
  return visibility === "public" ? "everyone" : "connections";
}

export function parseEventListingOptions(
  row: Record<string, unknown> | null | undefined,
  metadata?: Record<string, unknown> | null,
): EventListingOptions {
  const meta = metadata && isRecord(metadata) ? metadata : {};
  const source = row && isRecord(row) ? row : {};
  return {
    event_visibility: parseEventVisibility(
      source.event_visibility ?? meta.event_visibility ?? meta.eventVisibility,
    ),
    event_capacity: parseEventCapacity(
      source.event_capacity ?? meta.event_capacity ?? meta.eventCapacity,
    ),
    approval_required: parseApprovalRequired(
      source.approval_required ?? meta.approval_required ?? meta.approvalRequired,
    ),
    guest_list_visibility: parseGuestListVisibility(
      source.guest_list_visibility ?? meta.guest_list_visibility ?? meta.guestListVisibility,
    ),
    cover_theme_id: parseCoverThemeId(
      source.cover_theme_id ?? meta.cover_theme_id ?? meta.coverThemeId,
    ),
  };
}

export function parseEventListingOptionsFromBody(body: Record<string, unknown>): EventListingOptions {
  const meta = isRecord(body.metadata) ? body.metadata : {};
  return parseEventListingOptions(body, meta);
}

export function eventListingMetadataPatch(options: EventListingOptions): Record<string, unknown> {
  return {
    event_visibility: options.event_visibility,
    event_capacity: options.event_capacity,
    approval_required: options.approval_required,
    guest_list_visibility: options.guest_list_visibility,
    ...(options.cover_theme_id ? { cover_theme_id: options.cover_theme_id } : {}),
  };
}

export function eventCategoriesFromMetadata(meta: Record<string, unknown>): string[] {
  const raw = meta.event_categories ?? meta.eventCategories;
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 40);
  return Array.from(new Map(normalized.map((item) => [item.toLowerCase(), item])).values()).slice(
    0,
    8,
  );
}

export function coverVisualSeed(beaconId: string, coverThemeId?: string | null): string {
  return coverThemeId?.trim() || beaconId;
}

export function isoFromUnknown(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) {
    const ms = Date.parse(raw.trim());
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  return null;
}

export function eventTimeColumnsFromMetadata(meta: Record<string, unknown>): {
  starts_at: string | null;
  ends_at: string | null;
  event_timezone: string | null;
} {
  return {
    starts_at: isoFromUnknown(meta.event_start_at ?? meta.eventStartAt ?? meta.start_at),
    ends_at: isoFromUnknown(meta.event_end_at ?? meta.eventEndAt ?? meta.end_at),
    event_timezone: metaString(meta, "event_timezone", "eventTimezone"),
  };
}
