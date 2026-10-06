import { eventDropSchedule } from '@/lib/events/eventDropSchedule';

/**
 * Event-hub membership policy.
 *
 * Event chat is part of the RSVP experience, so accepted RSVP members can coordinate before they
 * physically arrive. Hosts always bypass the policy. The flags remain configurable for stricter
 * event modes and tests.
 */

export const EVENT_HUB_ACCESS = {
  requireCheckIn: false,
  requireRsvp: true,
} as const;

/**
 * Event chat lifetime: open from the moment the event is created, through the event and the
 * next-morning Click Drops reveal, then archived a day after that reveal — long enough to swap
 * photos and plan the after-hang. Until then its messages are kept (the rolling 24-hour purge
 * covers community hubs only); once archived the chat closes and its history is cleared.
 */
export const EVENT_HUB_ARCHIVE_AFTER_REVEAL_MS = 24 * 60 * 60 * 1000;

export function eventHubExpiresAtIso(
  schedule: { startEpochMs: number; endEpochMs: number },
  timeZone: string | null | undefined,
): string {
  const { revealAtMs } = eventDropSchedule({ startMs: schedule.startEpochMs, endMs: schedule.endEpochMs, timeZone });
  return new Date(revealAtMs + EVENT_HUB_ARCHIVE_AFTER_REVEAL_MS).toISOString();
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
