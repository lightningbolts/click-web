/**
 * The one RSVP state the event page shows (spec §7.6.2). Precedence: your own standing
 * (going, requested, waitlisted) beats the event's (ended, closed, full), so a guest who is
 * going still sees "You're going" when the event fills up.
 */
export type RsvpState =
  | "loading"
  | "guest"
  | "open"
  | "approval"
  | "going"
  | "requested"
  | "waitlist"
  | "full"
  | "ended"
  | "closed";

export type RsvpStateInput = {
  /** null while the session is unknown (client still loading). */
  signedIn: boolean | null;
  going: boolean;
  requestStatus: "pending" | "waitlisted" | "denied" | null | undefined;
  rsvpEnabled: boolean;
  approvalRequired: boolean;
  atCapacity: boolean;
  ended: boolean;
};

export function resolveRsvpState(s: RsvpStateInput): RsvpState {
  if (s.ended) return "ended";
  if (!s.rsvpEnabled) return s.going ? "going" : "closed";
  if (s.signedIn === null) return "loading";
  if (!s.signedIn) return s.atCapacity ? "full" : "guest";
  if (s.going) return "going";
  if (s.requestStatus === "pending") return "requested";
  if (s.requestStatus === "waitlisted") return "waitlist";
  if (s.atCapacity) return "full";
  return s.approvalRequired ? "approval" : "open";
}

export function eventAtCapacity(capacity: number | null | undefined, going: number): boolean {
  return capacity != null && going >= capacity; // same rule as decideMemberRsvp
}
