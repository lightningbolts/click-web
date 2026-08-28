import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256HexUtf8 } from "@/lib/connections/priorConnections";
import {
  parseEventListingOptions,
  type EventListingOptions,
  type EventRsvpRequestStatus,
} from "@/lib/events/eventOptions";
import { isRecord } from "@/lib/events/eventMetadata";

export type EventRsvpDecision =
  | { kind: "confirm" }
  | { kind: "pending" }
  | { kind: "waitlisted" }
  | { kind: "deny"; status: number; error: string };

export function listingOptionsFromBeacon(beacon: {
  event_visibility?: unknown;
  event_capacity?: unknown;
  approval_required?: unknown;
  guest_list_visibility?: unknown;
  cover_theme_id?: unknown;
  metadata?: Record<string, unknown>;
}): EventListingOptions {
  return parseEventListingOptions(beacon, beacon.metadata ?? {});
}

export async function countConfirmedRsvps(
  admin: SupabaseClient,
  beaconId: string,
): Promise<number> {
  const [{ count: clickCount }, { count: guestCount }] = await Promise.all([
    admin.from("beacon_attendees").select("user_id", { count: "exact", head: true }).eq("beacon_id", beaconId),
    admin.from("event_guest_rsvps").select("id", { count: "exact", head: true }).eq("beacon_id", beaconId),
  ]);
  return (clickCount ?? 0) + (guestCount ?? 0);
}

export async function loadRequestStatus(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
): Promise<EventRsvpRequestStatus | null> {
  const { data } = await admin
    .from("event_rsvp_requests")
    .select("status")
    .eq("beacon_id", beaconId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!isRecord(data) || typeof data.status !== "string") return null;
  if (
    data.status === "pending" ||
    data.status === "approved" ||
    data.status === "denied" ||
    data.status === "waitlisted"
  ) {
    return data.status;
  }
  return null;
}

export async function upsertRsvpRequest(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
  status: EventRsvpRequestStatus,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("event_rsvp_requests").upsert(
    {
      beacon_id: beaconId,
      user_id: userId,
      status,
      updated_at: now,
    },
    { onConflict: "beacon_id,user_id" },
  );
  if (error) {
    throw new Error(error.message);
  }
}

export async function decideMemberRsvp(args: {
  admin: SupabaseClient;
  beaconId: string;
  userId: string;
  options: EventListingOptions;
  alreadyGoing: boolean;
}): Promise<EventRsvpDecision> {
  const { admin, beaconId, userId, options, alreadyGoing } = args;
  if (alreadyGoing) return { kind: "confirm" };

  if (options.event_visibility === "invite_only") {
    const invited = await memberIsInvited(admin, beaconId, userId);
    if (!invited) {
      return {
        kind: "deny",
        status: 403,
        error: "This event is invite-only. Ask the host to add you.",
      };
    }
  }

  const confirmed = await countConfirmedRsvps(admin, beaconId);
  const atCapacity = options.event_capacity != null && confirmed >= options.event_capacity;
  if (atCapacity) return { kind: "waitlisted" };
  if (options.approval_required) return { kind: "pending" };
  return { kind: "confirm" };
}

export async function decideGuestRsvp(args: {
  admin: SupabaseClient;
  beaconId: string;
  options: EventListingOptions;
  contact: string;
}): Promise<EventRsvpDecision> {
  const { admin, beaconId, options, contact } = args;
  if (options.event_visibility === "invite_only") {
    const allowed = await guestContactIsInvited(admin, beaconId, contact);
    if (!allowed) {
      return {
        kind: "deny",
        status: 403,
        error: "This event is invite-only.",
      };
    }
  }
  const confirmed = await countConfirmedRsvps(admin, beaconId);
  if (options.event_capacity != null && confirmed >= options.event_capacity) {
    return { kind: "deny", status: 409, error: "This event is full." };
  }
  return { kind: "confirm" };
}

async function guestContactIsInvited(
  admin: SupabaseClient,
  beaconId: string,
  contact: string,
): Promise<boolean> {
  const email = contact.trim().toLowerCase();
  if (!email.includes("@")) return false;
  const { data: lists } = await admin.from("event_guest_lists").select("id").eq("beacon_id", beaconId);
  if (!Array.isArray(lists) || lists.length === 0) return false;
  const listIds = lists
    .map((row) => (isRecord(row) && typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => Boolean(id));
  if (listIds.length === 0) return false;
  const { data: entries } = await admin
    .from("event_guest_list_entries")
    .select("email, email_hash")
    .in("guest_list_id", listIds);
  if (!Array.isArray(entries)) return false;
  const hashed = sha256HexUtf8(email);
  return entries.some((row) => {
    if (!isRecord(row)) return false;
    const stored = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
    const hash = typeof row.email_hash === "string" ? row.email_hash : "";
    return stored === email || hash === hashed;
  });
}

async function memberIsInvited(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
): Promise<boolean> {
  const { data: lists } = await admin.from("event_guest_lists").select("id").eq("beacon_id", beaconId);
  if (!Array.isArray(lists) || lists.length === 0) return false;
  const listIds = lists
    .map((row) => (isRecord(row) && typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => Boolean(id));
  if (listIds.length === 0) return false;
  const { data: entries } = await admin
    .from("event_guest_list_entries")
    .select("matched_user_id")
    .in("guest_list_id", listIds)
    .eq("matched_user_id", userId)
    .limit(1);
  return Array.isArray(entries) && entries.length > 0;
}
