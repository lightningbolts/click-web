/**
 * Event-hub membership policy.
 * Flip [EVENT_HUB_ACCESS.requireRsvp] to also require an RSVP.
 * Host (event or hub creator) always bypasses both flags.
 */

export const EVENT_HUB_ACCESS = {
  requireCheckIn: true,
  requireRsvp: false,
} as const;

/** Hub stays open this long after the event's scheduled end. */
export const EVENT_HUB_TTL_AFTER_END_MS = 24 * 60 * 60 * 1000;

export function eventHubExpiresAtIso(eventEndEpochMs: number): string {
  return new Date(eventEndEpochMs + EVENT_HUB_TTL_AFTER_END_MS).toISOString();
}

export type EventHubAccessPolicy = {
  requireCheckIn: boolean;
  requireRsvp: boolean;
};

export type EventHubAccessInput = {
  userId: string;
  hubCreatorId: string | null;
  eventCreatorId: string | null;
  hasActiveCheckIn: boolean;
  hasRsvp: boolean;
  policy?: EventHubAccessPolicy;
};

export function evaluateEventHubAccess(input: EventHubAccessInput): boolean {
  const userId = input.userId.trim();
  if (!userId) return false;
  if (input.hubCreatorId && userId === input.hubCreatorId) return true;
  if (input.eventCreatorId && userId === input.eventCreatorId) return true;
  const policy = input.policy ?? EVENT_HUB_ACCESS;
  if (policy.requireCheckIn && !input.hasActiveCheckIn) return false;
  if (policy.requireRsvp && !input.hasRsvp) return false;
  return true;
}
