/**
 * Shared by the late readings a phone sends for encounters it already logged (barometric
 * altitude, a tighter location): timing checks, and finding the caller's rows for one tap.
 *
 * A tap is identified by its exact connection moment, which the phone stamped into each row's
 * `sensor_observation.connection_moment` (millisecond precision, so it never collides between
 * taps). Every row the caller reported at that moment is the same tap — including the pairwise
 * rows a group tap writes beside the group's — so all of them are filled, provided the moment
 * belongs to one of the connections the phone named.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The phone sends a follow-up within seconds; older moments are not accepted. */
export const FOLLOW_UP_MAX_MOMENT_AGE_MS = 15 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
/** The reading may be at most this long after the moment (the phone waits 20 s). */
export const FOLLOW_UP_MAX_FIX_DELAY_MS = 60_000;
const FIX_LOOKBACK_MS = 30_000;
/** `connection_moment` is stamped with millisecond precision. */
const MOMENT_MATCH_TOLERANCE_MS = 2;

export type FollowUpTiming = {
  connectionIds: string[];
  connectionMoment: string;
  observedAt: string;
};

export function parseMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Validates the moment and when the reading was taken; returns an error message or null. */
export function validateFollowUpTiming(input: FollowUpTiming, nowMs: number): string | null {
  const momentMs = parseMs(input.connectionMoment);
  const observedMs = parseMs(input.observedAt);
  if (momentMs == null || observedMs == null) return 'Invalid timestamps';
  if (nowMs - momentMs > FOLLOW_UP_MAX_MOMENT_AGE_MS || momentMs - nowMs > MAX_FUTURE_SKEW_MS) {
    return 'Connection moment is out of range';
  }
  if (observedMs - momentMs > FOLLOW_UP_MAX_FIX_DELAY_MS || momentMs - observedMs > FIX_LOOKBACK_MS) {
    return 'Reading is too far from the connection moment';
  }
  return null;
}

type MomentRow = { connection_id: string; sensor_observation: Record<string, unknown> | null };

function momentOf(row: MomentRow): number | null {
  const raw = row.sensor_observation?.connection_moment;
  return typeof raw === 'string' ? parseMs(raw) : null;
}

/**
 * The caller's rows for the tap at `connectionMoment` (`columns` must include `connection_id`
 * and `sensor_observation`). Empty unless that tap logged one of `connectionIds`.
 */
export async function followUpRows<Row extends MomentRow>(
  admin: SupabaseClient,
  userId: string,
  input: FollowUpTiming,
  columns: string,
  nowMs: number,
): Promise<Row[]> {
  const momentMs = parseMs(input.connectionMoment);
  if (momentMs == null) return [];
  const { data, error } = await admin
    .from('connection_encounters')
    .select(columns)
    .eq('reporting_user_id', userId)
    .gte('encountered_at', new Date(nowMs - FOLLOW_UP_MAX_MOMENT_AGE_MS - MAX_FUTURE_SKEW_MS).toISOString());
  if (error) throw new Error(`encounter lookup: ${error.message}`);
  const rows = ((data ?? []) as unknown as Row[]).filter((row) => {
    const rowMoment = momentOf(row);
    return rowMoment != null && Math.abs(rowMoment - momentMs) <= MOMENT_MATCH_TOLERANCE_MS;
  });
  const named = new Set(input.connectionIds);
  return rows.some((row) => named.has(row.connection_id)) ? rows : [];
}
