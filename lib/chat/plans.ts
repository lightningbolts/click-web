/**
 * Hangout plans sent in chat. Wire contract shared with iOS `HangoutPlan`
 * (`click-ios/Click/Core/Chat/ChatMessage.swift`): a text message whose encrypted body is
 * the human-readable summary and whose `metadata.plan` carries the structured fields.
 * RSVPs are exclusive reactions on the plan message: ✅ going, ❌ can't make it.
 */
import type { Message } from '@/lib/chat/types';

export type HangoutPlan = {
  title: string;
  /** ms since epoch */
  startsAt: number;
  /** ms since epoch; only kept when after `startsAt` */
  endsAt: number | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
};

export const PLAN_GOING_REACTION = '✅';
export const PLAN_DECLINED_REACTION = '❌';

/** Assumed length of a plan without an end time (iOS `endsOrAssumedEnd`). */
const ASSUMED_PLAN_MS = 3 * 60 * 60 * 1000;

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function makePlan(input: {
  title: string;
  startsAt: number;
  endsAt?: number | null;
  placeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): HangoutPlan {
  const endsAt = input.endsAt != null && input.endsAt > input.startsAt ? input.endsAt : null;
  const hasCoords = input.latitude != null && input.longitude != null;
  return {
    title: input.title.trim(),
    startsAt: input.startsAt,
    endsAt,
    placeName: nonEmpty(input.placeName),
    latitude: hasCoords ? (input.latitude as number) : null,
    longitude: hasCoords ? (input.longitude as number) : null,
  };
}

export function parsePlan(metadata: Message['metadata'] | Record<string, unknown> | null | undefined): HangoutPlan | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).plan;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const plan = raw as Record<string, unknown>;
  const title = nonEmpty(plan.title);
  const startsAt = finiteNumber(plan.starts_at);
  if (!title || startsAt == null) return null;
  return makePlan({
    title,
    startsAt,
    endsAt: finiteNumber(plan.ends_at),
    placeName: nonEmpty(plan.place_name),
    latitude: finiteNumber(plan.lat),
    longitude: finiteNumber(plan.lon),
  });
}

export function planWire(plan: HangoutPlan): Record<string, unknown> {
  const wire: Record<string, unknown> = { title: plan.title, starts_at: Math.trunc(plan.startsAt) };
  if (plan.endsAt != null) wire.ends_at = Math.trunc(plan.endsAt);
  if (plan.placeName) wire.place_name = plan.placeName;
  if (plan.latitude != null && plan.longitude != null) {
    wire.lat = plan.latitude;
    wire.lon = plan.longitude;
  }
  return wire;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Sat, Sep 27, 7:00 PM–9:00 PM" (end shows its date only when on another day). */
export function planWhenText(plan: HangoutPlan, locale = 'en-US'): string {
  const start = new Date(plan.startsAt);
  let text = start.toLocaleString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (plan.endsAt != null) {
    const end = new Date(plan.endsAt);
    text += `–${end.toLocaleString(
      locale,
      sameDay(start, end)
        ? { hour: 'numeric', minute: '2-digit' }
        : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
    )}`;
  }
  return text;
}

/** The message body: readable anywhere, even where plans aren't understood. */
export function planSummary(plan: HangoutPlan, locale = 'en-US'): string {
  return `📅 ${plan.title} · ${planWhenText(plan, locale)}${plan.placeName ? ` · 📍 ${plan.placeName}` : ''}`;
}

export function planEndsOrAssumedEnd(plan: HangoutPlan): number {
  return plan.endsAt ?? plan.startsAt + ASSUMED_PLAN_MS;
}

export function planIsOver(plan: HangoutPlan, now = Date.now()): boolean {
  return planEndsOrAssumedEnd(plan) < now;
}

export function planMapsUrl(plan: HangoutPlan): string | null {
  if (plan.latitude != null && plan.longitude != null) {
    return `https://maps.google.com/?q=${plan.latitude},${plan.longitude}`;
  }
  if (plan.placeName) return `https://maps.google.com/?q=${encodeURIComponent(plan.placeName)}`;
  return null;
}

/** Going / declined user ids from a message's reactions. */
export function planRsvps(message: Pick<Message, 'reactions'>): { going: string[]; declined: string[] } {
  const reactions = message.reactions ?? {};
  return {
    going: (reactions[PLAN_GOING_REACTION] ?? []).map((r) => r.user_id),
    declined: (reactions[PLAN_DECLINED_REACTION] ?? []).map((r) => r.user_id),
  };
}
