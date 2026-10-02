import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PlaceCategory,
  PlaceManagerRole,
  PlaceVerificationStatus,
} from '@/lib/places/types';

/** Columns every Places route may need. Never sent to a client as-is (see serialize.ts). */
export const PLACE_COLUMNS =
  'id, slug, name, category, description, photo_path, hours, timezone, address_line, city, region, postal_code, country_code, website_url, latitude, longitude, radius_meters, verification_status, listed, hub_enabled, location, subscription_status, updated_at';

export type PlaceRow = {
  id: string;
  slug: string | null;
  name: string;
  category: PlaceCategory | null;
  description: string | null;
  photo_path: string | null;
  hours: unknown;
  timezone: string | null;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  website_url: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  verification_status: PlaceVerificationStatus;
  listed: boolean;
  hub_enabled: boolean;
  /** Legacy free-text address from B2B signup. */
  location: string | null;
  subscription_status: string | null;
  updated_at: string | null;
};

/** A Place consumers may see: listed, verified, with a center, slug and category. */
export type ConsumerPlaceRow = PlaceRow & {
  slug: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadPlaceByIdOrSlug(admin: SupabaseClient, idOrSlug: string): Promise<PlaceRow | null> {
  const key = idOrSlug.trim();
  if (!key) return null;
  const column = UUID_RE.test(key) ? 'id' : 'slug';
  const { data, error } = await admin
    .from('places')
    .select(PLACE_COLUMNS)
    .eq(column, column === 'slug' ? key.toLowerCase() : key)
    .maybeSingle();
  if (error) throw new Error(`loadPlaceByIdOrSlug: ${error.message}`);
  return (data as PlaceRow | null) ?? null;
}

export function isConsumerPlace(place: PlaceRow | null): place is ConsumerPlaceRow {
  return (
    place != null &&
    place.listed === true &&
    place.verification_status === 'verified' &&
    place.latitude != null &&
    place.longitude != null &&
    place.slug != null &&
    place.category != null
  );
}

/** Listed + verified Place, or null (consumer routes answer 404 `place_not_found`). */
export async function loadConsumerPlace(admin: SupabaseClient, idOrSlug: string): Promise<ConsumerPlaceRow | null> {
  const place = await loadPlaceByIdOrSlug(admin, idOrSlug);
  return isConsumerPlace(place) ? place : null;
}

export async function isPlaceManager(
  admin: SupabaseClient,
  placeId: string,
  userId: string,
): Promise<PlaceManagerRole | null> {
  const { data, error } = await admin
    .from('place_managers')
    .select('role')
    .eq('place_id', placeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`isPlaceManager: ${error.message}`);
  const role = (data as { role?: string } | null)?.role;
  return role === 'owner' || role === 'manager' || role === 'viewer' ? role : null;
}

/** Manager user ids per Place (used to drop managers' own Pulses from summaries). */
export async function loadManagerIdsByPlace(
  admin: SupabaseClient,
  placeIds: string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (placeIds.length === 0) return out;
  const { data, error } = await admin.from('place_managers').select('place_id, user_id').in('place_id', placeIds);
  if (error) throw new Error(`loadManagerIdsByPlace: ${error.message}`);
  for (const row of (data ?? []) as Array<{ place_id: string; user_id: string }>) {
    const set = out.get(row.place_id) ?? new Set<string>();
    set.add(row.user_id);
    out.set(row.place_id, set);
  }
  return out;
}
