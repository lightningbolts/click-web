/**
 * POST /api/hub/create
 * Community hub: inserts hub + creator participant. Hubs do not expire (`expires_at` null).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';
import { insertHub } from '@/lib/server/hubCreate';
import { placeHubConflict } from '@/lib/server/places/placeHub';
import { parseBody } from '@/lib/api/parseBody';
import { hubCreateBodySchema } from '@/lib/api/schemas/beacons';

type LocationPayload = {
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  radius_meters?: number;
};

function parseLocation(raw: unknown): { lat: number; lng: number; radius: number } | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as LocationPayload;
  const lat = typeof o.latitude === 'number' ? o.latitude : typeof o.lat === 'number' ? o.lat : null;
  const lng = typeof o.longitude === 'number' ? o.longitude : typeof o.lng === 'number' ? o.lng : null;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const radius =
    typeof o.radius_meters === 'number' && Number.isFinite(o.radius_meters) && o.radius_meters > 0
      ? Math.min(Math.floor(o.radius_meters), 5_000)
      : 50;
  return { lat, lng, radius };
}

export async function POST(request: NextRequest) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(request, hubCreateBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : 'general';
  const location = parseLocation(body.location);

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 });
  }
  if (!location) {
    return NextResponse.json(
      { error: 'location must include latitude/longitude (or lat/lng) within valid ranges' },
      { status: 400 },
    );
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey?.trim()) {
    return NextResponse.json({ error: 'Hub creation requires server configuration' }, { status: 503 });
  }

  const admin = createChatGatekeeperAdmin();

  // Inside a listed Place with its own hub: use the Place Hub instead of a duplicate.
  const conflict = await placeHubConflict(admin, location.lat, location.lng);
  if (conflict) {
    return NextResponse.json(
      { error: 'This Place already has a hub', code: 'place_hub_exists', ...conflict },
      { status: 409 },
    );
  }

  const created = await insertHub(admin, {
    name,
    category,
    lat: location.lat,
    lng: location.lng,
    radiusMeters: location.radius,
    creatorId: auth.user.id,
  });

  if (!created.ok) {
    console.error('hub/create insert error:', created.error);
    return NextResponse.json({ error: 'Failed to create hub' }, { status: 500 });
  }
  const hubId = created.hubId;

  return NextResponse.json({
    hub_id: hubId,
    expires_at: null,
  });
}
