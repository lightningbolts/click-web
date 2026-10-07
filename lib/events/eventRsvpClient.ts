import { getFreshAuthHeaders } from "@/lib/auth/freshAuthHeaders";
import { eventRsvpKey } from "@/lib/events/eventRsvpKey";
import { warmFetch, withWarmFetch } from "@/lib/swr/warmFetch";

export type EventRsvpAttendee = {
  user_id: string;
  name: string;
  avatar_url: string | null;
};

export type EventRsvpPayload = {
  current_user_signed_up?: boolean;
  request_status?: "pending" | "waitlisted" | null;
  attendees?: EventRsvpAttendee[];
  rsvp_count?: number;
};

async function readEventRsvpPayload(url: string): Promise<EventRsvpPayload> {
  const headers = await getFreshAuthHeaders();
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to load RSVP");
  return res.json() as Promise<EventRsvpPayload>;
}

/** The viewer's RSVP and the guests (`eventRsvpKey`), answered by a read warmed on intent. */
export const fetchEventRsvpPayload = withWarmFetch(readEventRsvpPayload);

export const mutualAttendeesKey = (beaconId: string) => `/api/beacons/${beaconId}/mutual-attendees`;

export type MutualAttendees = { count: number; attendees: Array<{ user_id: string }> };

async function readMutualAttendees(url: string): Promise<MutualAttendees> {
  const res = await fetch(url, { headers: await getFreshAuthHeaders() });
  if (!res.ok) throw new Error("Failed to load mutual attendees");
  return res.json() as Promise<MutualAttendees>;
}

/** Which of your Clicks are going (`mutualAttendeesKey`), answered by a read warmed on intent. */
export const fetchMutualAttendees = withWarmFetch(readMutualAttendees);

/**
 * Starts the event page's signed-in reads (who's going, your RSVP, your Clicks there) before it
 * opens, so its people section and going line are there with the page instead of popping in.
 */
export function warmEventViewer(beaconId: string): void {
  warmFetch(eventRsvpKey(beaconId), readEventRsvpPayload);
  warmFetch(mutualAttendeesKey(beaconId), readMutualAttendees);
}

export function applyRsvpOptimistic(
  current: EventRsvpPayload | undefined,
  attendee: EventRsvpAttendee,
): EventRsvpPayload {
  const attendees = current?.attendees ?? [];
  const exists = attendees.some((row) => row.user_id === attendee.user_id);
  const nextAttendees = exists ? attendees : [...attendees, attendee];
  const prevCount = current?.rsvp_count ?? attendees.length;
  return {
    ...current,
    current_user_signed_up: true,
    request_status: null,
    attendees: nextAttendees,
    rsvp_count: exists ? prevCount : prevCount + 1,
  };
}

export function applyCancelOptimistic(
  current: EventRsvpPayload | undefined,
  userId: string,
): EventRsvpPayload {
  const attendees = (current?.attendees ?? []).filter((row) => row.user_id !== userId);
  const prevCount = current?.rsvp_count ?? current?.attendees?.length ?? 0;
  const wasGoing = current?.current_user_signed_up === true;
  return {
    ...current,
    current_user_signed_up: false,
    request_status: null,
    attendees,
    rsvp_count: Math.max(0, prevCount - (wasGoing ? 1 : 0)),
  };
}
