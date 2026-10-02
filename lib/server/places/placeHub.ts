import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { insertHub } from '@/lib/server/hubCreate';
import type { PlaceRow } from '@/lib/server/places/loadPlace';

/** Place Hubs (§5.7): one hub per Place, id `place-{placeId}`, linked by `hub_venues.place_id`. */

export function placeHubId(placeId: string): string {
  return `place-${placeId}`;
}

/** Whether a Place's hub is switched on. */
export async function placeHubEnabled(admin: SupabaseClient, placeId: string): Promise<boolean> {
  const { data } = await admin.from('places').select('hub_enabled').eq('id', placeId).maybeSingle();
  return (data as { hub_enabled?: boolean } | null)?.hub_enabled === true;
}

/**
 * The Place a hub belongs to, or null for standalone/event hubs. Fails open (null) on read
 * errors: `hub_enabled` is a product switch, not an access control; the hub's own gates still run.
 */
export async function placeForHub(
  admin: SupabaseClient,
  hubId: string,
): Promise<{ placeId: string; hubEnabled: boolean } | null> {
  try {
    const { data: hub } = await admin.from('hub_venues').select('place_id').eq('id', hubId).maybeSingle();
    const placeId = (hub as { place_id?: string | null } | null)?.place_id;
    if (!placeId) return null;
    return { placeId, hubEnabled: await placeHubEnabled(admin, placeId) };
  } catch (e) {
    console.warn('[places] placeForHub:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** 410 `hub_disabled` for a Place Hub whose Place turned its hub off; null otherwise. */
export function hubDisabledResponse(): NextResponse {
  return NextResponse.json({ error: 'This Place Hub is turned off', code: 'hub_disabled' }, { status: 410 });
}

export async function placeHubDisabledResponse(admin: SupabaseClient, hubId: string): Promise<NextResponse | null> {
  const link = await placeForHub(admin, hubId);
  return link && !link.hubEnabled ? hubDisabledResponse() : null;
}

/** Create the Place Hub if it doesn't exist yet and add `userId` as a participant. Returns the hub id. */
export async function ensurePlaceHub(
  admin: SupabaseClient,
  place: Pick<PlaceRow, 'id' | 'name' | 'category' | 'latitude' | 'longitude' | 'radius_meters'>,
  userId: string,
): Promise<{ ok: true; hubId: string } | { ok: false; error: string }> {
  const { data: existing, error } = await admin.from('hub_venues').select('id').eq('place_id', place.id).maybeSingle();
  if (error) return { ok: false, error: error.message };
  const existingId = (existing as { id?: string } | null)?.id;
  if (existingId) {
    await admin
      .from('hub_participants')
      .upsert({ hub_id: existingId, user_id: userId }, { onConflict: 'hub_id,user_id', ignoreDuplicates: true });
    return { ok: true, hubId: existingId };
  }
  if (place.latitude == null || place.longitude == null) {
    return { ok: false, error: 'Set the Place location before enabling its hub' };
  }
  return insertHub(admin, {
    id: placeHubId(place.id),
    name: place.name,
    category: place.category ?? 'other',
    lat: place.latitude,
    lng: place.longitude,
    radiusMeters: place.radius_meters,
    creatorId: userId,
    placeId: place.id,
  });
}
