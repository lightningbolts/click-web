import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFeature } from '@/lib/server/featureFlags';

/**
 * Pilot product events (spec §11). Names and property keys are allowlisted; values must be short
 * scalars. Never user content, other people's IDs, or coordinates. Emission is gated by the
 * pilot_analytics cohort and never fails the request that triggered it.
 */
export const PRODUCT_EVENTS = [
  'install',
  'app_open',
  'day2_return',
  'day7_return',
  'beacon_created',
  'beacon_joined',
  'drop_posted',
  'drop_ready_opened',
  'recap_opened',
  'nudge_shown',
  'nudge_acted',
  'place_viewed',
  'place_check_in',
  'place_check_in_rejected',
  'place_pulse',
  'place_hub_opened',
] as const;
export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

/** Events a client may send itself; everything else is emitted by the server where it happens. */
export const CLIENT_PRODUCT_EVENTS: ReadonlySet<ProductEvent> = new Set(['install', 'app_open', 'recap_opened']);

const ALLOWED_PROPS: Record<ProductEvent, readonly string[]> = {
  install: [],
  app_open: [],
  day2_return: [],
  day7_return: [],
  beacon_created: ['type'],
  beacon_joined: ['type'],
  drop_posted: ['kind'],
  drop_ready_opened: ['kind'],
  recap_opened: ['access'],
  nudge_shown: ['kind'],
  nudge_acted: ['kind'],
  place_viewed: ['source'],
  place_check_in: ['proof'],
  place_check_in_rejected: ['reason'],
  place_pulse: ['has_energy', 'has_followup'],
  place_hub_opened: [],
};

export function sanitizeProductProps(event: ProductEvent, raw: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of ALLOWED_PROPS[event]) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
    else if (typeof value === 'string' && /^[a-z0-9_]{1,32}$/.test(value)) out[key] = value;
  }
  return out;
}

export async function emitProductEvent(
  admin: SupabaseClient,
  userId: string | null,
  event: ProductEvent,
  props: Record<string, unknown> = {},
  meta: { platform?: 'ios' | 'android' | 'web' | null; appVersion?: string | null; occurredAt?: string | null } = {},
): Promise<boolean> {
  try {
    if (!userId || !(await resolveFeature(admin, 'pilot_analytics', userId)).enabled) return false;
    const { error } = await admin.from('product_events').insert({
      event,
      user_id: userId,
      props: sanitizeProductProps(event, props),
      platform: meta.platform ?? null,
      app_version: meta.appVersion?.slice(0, 32) ?? null,
      ...(meta.occurredAt ? { occurred_at: meta.occurredAt } : {}),
    });
    if (error) console.warn('[product-events]', event, error.message);
    return !error;
  } catch (e) {
    console.warn('[product-events]', event, e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Which retention milestone an app open marks, from the (latest) install time. */
export function returnMilestone(installAtMs: number, openAtMs: number): 'day2_return' | 'day7_return' | null {
  const day = Math.floor((openAtMs - installAtMs) / 86_400_000);
  if (day === 1) return 'day2_return';
  if (day >= 6 && day <= 7) return 'day7_return';
  return null;
}
