import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Server-driven feature flags (`public.feature_flags`). Every post-9/29 feature ships dark behind
 * one: a row is off until `enabled`, then on for `allow_user_ids` plus a stable `rollout_percent`
 * cohort. `config` holds the feature's tunable numbers; code defaults fill any missing key.
 */

export const FEATURE_KEYS = ['drops_develop', 'alert_confirmations'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  rollout_percent: number;
  allow_user_ids: string[] | null;
  config: Record<string, unknown> | null;
};

export type ResolvedFeature = { enabled: boolean; config: Record<string, unknown> };

/** FNV-1a 32-bit — a stable 0-99 bucket per (flag, user), so cohorts don't reshuffle. */
export function rolloutBucket(key: string, userId: string): number {
  let hash = 0x811c9dc5;
  const input = `${key}:${userId}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

export function isFlagOnForUser(row: FeatureFlagRow | undefined, userId: string): boolean {
  if (!row?.enabled) return false;
  if ((row.allow_user_ids ?? []).includes(userId)) return true;
  return rolloutBucket(row.key, userId) < Math.max(0, Math.min(100, row.rollout_percent));
}

const CACHE_TTL_MS = 30_000;
let cache: { at: number; rows: Map<string, FeatureFlagRow> } | null = null;

/** Test hook: forget cached rows. */
export function resetFeatureFlagCache(): void {
  cache = null;
}

async function loadRows(admin: SupabaseClient): Promise<Map<string, FeatureFlagRow>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const { data, error } = await admin
    .from('feature_flags')
    .select('key, enabled, rollout_percent, allow_user_ids, config');
  if (error) {
    // Fail closed: a flag we can't read is off. Keep a stale cache if we have one.
    console.error('[featureFlags] load:', error.message);
    return cache?.rows ?? new Map();
  }
  const rows = new Map(((data ?? []) as FeatureFlagRow[]).map((row) => [row.key, row]));
  cache = { at: Date.now(), rows };
  return rows;
}

export async function resolveFeature(
  admin: SupabaseClient,
  key: FeatureKey,
  userId: string,
): Promise<ResolvedFeature> {
  const row = (await loadRows(admin)).get(key);
  return { enabled: isFlagOnForUser(row, userId), config: row?.config ?? {} };
}

export async function resolveAllFeatures(
  admin: SupabaseClient,
  userId: string,
): Promise<Record<FeatureKey, ResolvedFeature>> {
  const rows = await loadRows(admin);
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => {
      const row = rows.get(key);
      return [key, { enabled: isFlagOnForUser(row, userId), config: row?.config ?? {} }];
    }),
  ) as Record<FeatureKey, ResolvedFeature>;
}

/** Config reads the cron and routes can trust: a finite number within [min, max], else the default. */
export function configNumber(
  config: Record<string, unknown>,
  name: string,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const raw = config[name];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) return fallback;
  return value;
}

/** 404 for a flag that's off for this user, so dark features are indistinguishable from absent. */
export async function requireFeature(
  admin: SupabaseClient,
  key: FeatureKey,
  userId: string,
): Promise<{ ok: true; config: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const feature = await resolveFeature(admin, key, userId);
  if (!feature.enabled) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { ok: true, config: feature.config };
}
