import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlaceCategory } from '@/lib/places/types';
import { placePhotoUrl } from '@/lib/server/places/serialize';

/**
 * The Place an event or encounter belongs to, as other payloads carry it (§5.11). Only listed,
 * verified Places are ever surfaced; anything else is `null`, so older clients see nothing new.
 */
export type PlaceRef = {
  id: string;
  slug: string;
  name: string;
  category: PlaceCategory;
  /** The Place's photo, so an event it hosts can wear its face as the host. */
  photo_url: string | null;
  city: string | null;
};

export async function loadPlaceRefs(
  admin: SupabaseClient,
  ids: Array<string | null | undefined>,
): Promise<Map<string, PlaceRef>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const out = new Map<string, PlaceRef>();
  if (unique.length === 0) return out;
  const { data, error } = await admin
    .from('places')
    .select('id, slug, name, category, photo_path, city, listed, verification_status')
    .in('id', unique)
    .eq('listed', true)
    .eq('verification_status', 'verified');
  if (error) {
    console.warn('[places] loadPlaceRefs:', error.message);
    return out;
  }
  type Row = { id: string; slug: string | null; name: string; category: PlaceCategory | null; photo_path: string | null; city: string | null };
  for (const row of (data ?? []) as Row[]) {
    if (!row.slug || !row.category) continue;
    out.set(row.id, {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      photo_url: placePhotoUrl(row.photo_path),
      city: row.city?.trim() || null,
    });
  }
  return out;
}

/** Adds `place` (or null) to each item from its `venue_id`, batch-loaded. */
export async function withPlaceRefs<T extends { venue_id?: string | null }>(
  admin: SupabaseClient,
  items: T[],
): Promise<Array<T & { place: PlaceRef | null }>> {
  const refs = await loadPlaceRefs(admin, items.map((i) => i.venue_id));
  return items.map((item) => ({ ...item, place: (item.venue_id && refs.get(item.venue_id)) || null }));
}

/**
 * Distinct handshake connections with an encounter at this Place in the last 30 days whose
 * connection counts for business insights (§5.11.4). A count only.
 */
export async function countConnectionsViaPlaceEncounters(
  admin: SupabaseClient,
  placeId: string,
  nowMs: number = Date.now(),
): Promise<number> {
  const sinceIso = new Date(nowMs - 30 * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('connection_encounters')
    .select('connection_id')
    .eq('place_id', placeId)
    .gte('encountered_at', sinceIso)
    .limit(20000);
  if (error) throw new Error(`connections via Place encounters: ${error.message}`);
  const ids = [...new Set(((data ?? []) as Array<{ connection_id: string }>).map((r) => r.connection_id))];
  if (ids.length === 0) return 0;
  const { data: conns, error: connErr } = await admin
    .from('connections')
    .select('id')
    .in('id', ids)
    .eq('include_in_business_insights', true)
    .eq('source', 'handshake');
  if (connErr) throw new Error(`connections via Place encounters: ${connErr.message}`);
  return (conns ?? []).length;
}
