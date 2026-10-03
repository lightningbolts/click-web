import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { slugCandidates, slugifyPlaceName } from '@/lib/places/slug';
import type { PlaceCategory } from '@/lib/places/types';

/** One way to create a Place: admins (verified at once) and businesses (pending review) share it. */
export type NewPlace = {
  name: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  timezone: string;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  websiteUrl: string | null;
};

export type CreatePlaceResult = { id: string; slug: string } | { error: string };

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A free slug from the name and city (`name-city`, then `-2`…`-20`), or null. */
async function freeSlug(admin: SupabaseClient, name: string, city: string | null): Promise<string | null> {
  const base = slugifyPlaceName(name, city);
  if (base.length < 3) return null;
  const candidates = slugCandidates(base.slice(0, 76));
  const { data: taken } = await admin.from('places').select('slug').in('slug', candidates);
  const takenSet = new Set(((taken ?? []) as Array<{ slug: string }>).map((r) => r.slug));
  return candidates.find((c) => !takenSet.has(c)) ?? null;
}

/**
 * Inserts an unlisted Place. `verifiedBy` (an admin) verifies it at once; without it the Place is
 * `pending` until a Click admin reviews it. `ownerId` becomes its owner (self-serve setup).
 */
export async function createPlace(
  admin: SupabaseClient,
  place: NewPlace,
  options: { verifiedBy?: string; ownerId?: string },
): Promise<CreatePlaceResult> {
  const slug = await freeSlug(admin, place.name, place.city);
  if (!slug) return { error: 'Too many Places share this name and city. Edit the name.' };
  const verified = options.verifiedBy
    ? { verification_status: 'verified', verified_at: new Date().toISOString(), verified_by: options.verifiedBy }
    : { verification_status: 'pending' };
  const { data, error } = await admin
    .from('places')
    .insert({
      name: place.name,
      slug,
      category: place.category,
      latitude: place.latitude,
      longitude: place.longitude,
      radius_meters: Math.round(place.radiusMeters),
      timezone: place.timezone,
      address_line: place.addressLine,
      city: place.city,
      region: place.region,
      postal_code: place.postalCode,
      country_code: place.countryCode?.toUpperCase() ?? null,
      website_url: place.websiteUrl,
      listed: false,
      subscription_status: 'inactive',
      ...verified,
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'unknown error' };
  const id = (data as { id: string }).id;
  if (options.ownerId) {
    const { error: managerError } = await admin
      .from('place_managers')
      .upsert({ user_id: options.ownerId, place_id: id, role: 'owner' }, { onConflict: 'user_id,place_id' });
    if (managerError) {
      await admin.from('places').delete().eq('id', id);
      return { error: managerError.message };
    }
  }
  return { id, slug };
}

/** Every verified Place gets a check-in QR code, so its poster is ready the moment it's verified. */
export async function ensureCheckInAnchor(admin: SupabaseClient, placeId: string): Promise<void> {
  const { data } = await admin
    .from('nfc_anchors')
    .select('id')
    .eq('venue_id', placeId)
    .eq('purpose', 'check_in')
    .eq('active', true)
    .limit(1);
  if ((data ?? []).length > 0) return;
  const { error } = await admin
    .from('nfc_anchors')
    .insert({ venue_id: placeId, name: 'Front counter', map_x: 0, map_y: 0, purpose: 'check_in' });
  if (error) console.error('[places] check-in anchor:', error.message);
}
