import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_PLACES_CONFIG, placesConfigFrom } from '@/lib/places/config';
import type { PlaceDetail } from '@/lib/places/types';
import { buildPublicDetail } from '@/lib/server/places/detail';
import { loadConsumerPlace } from '@/lib/server/places/loadPlace';

/** `/p/[slug]` is public, gated by this env var rather than the per-user flag (§7.1). */
export function placesPublicPagesEnabled(): boolean {
  return process.env.PLACES_PUBLIC_PAGES_ENABLED === 'true';
}

async function loadFlagConfig(admin: SupabaseClient): Promise<Record<string, unknown>> {
  const { data } = await admin.from('feature_flags').select('config').eq('key', 'click_places').maybeSingle();
  const config = (data as { config?: unknown } | null)?.config;
  return config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
}

/**
 * Anonymous PlaceDetail for the public web page: aggregate fields only (pulse, here_now_count,
 * pattern, public official events). Every viewer-only field is null / [] and `viewer` is null.
 */
export async function loadPublicPlace(
  admin: SupabaseClient,
  slug: string,
  nowMs: number = Date.now(),
): Promise<PlaceDetail | null> {
  if (!placesPublicPagesEnabled()) return null;
  const place = await loadConsumerPlace(admin, slug);
  if (!place) return null;
  let config = DEFAULT_PLACES_CONFIG;
  try {
    config = placesConfigFrom(await loadFlagConfig(admin));
  } catch {
    /* defaults */
  }
  return buildPublicDetail(admin, place, config, nowMs);
}
