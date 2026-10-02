import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Insert a permanent community hub plus its creator as a participant. Shared by
 * `POST /api/hub/create` and Place Hubs (`place-{placeId}`, linked by `place_id`).
 */
export async function insertHub(
  admin: SupabaseClient,
  input: {
    id?: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
    radiusMeters: number;
    creatorId: string;
    placeId?: string | null;
  },
): Promise<{ ok: true; hubId: string } | { ok: false; error: string }> {
  const hubId = input.id ?? `hub_${randomUUID().replace(/-/g, '')}`;
  const { error: hubErr } = await admin.from('hub_venues').insert({
    id: hubId,
    name: input.name,
    category: input.category,
    geofence_lat: input.lat,
    geofence_long: input.lng,
    radius_meters: input.radiusMeters,
    expires_at: null,
    creator_id: input.creatorId,
    ...(input.placeId ? { place_id: input.placeId } : {}),
  });
  if (hubErr) return { ok: false, error: hubErr.message };

  const { error: partErr } = await admin.from('hub_participants').insert({ hub_id: hubId, user_id: input.creatorId });
  if (partErr) console.error('hub create participant insert error:', partErr.message);
  return { ok: true, hubId };
}
