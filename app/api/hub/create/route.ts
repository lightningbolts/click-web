/**
 * POST /api/hub/create
 * Ephemeral community hub: server computes expires_at (now + 24h), inserts hub + creator participant.
 */

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { computeEphemeralHubExpiry } from '@/lib/hub/ephemeralHubTtl';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

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

  const hubId = `hub_${randomUUID().replace(/-/g, '')}`;
  const { expires_at_iso } = computeEphemeralHubExpiry();

  const admin = createChatGatekeeperAdmin();

  const hubRow = {
    id: hubId,
    name,
    category,
    geofence_lat: location.lat,
    geofence_long: location.lng,
    radius_meters: location.radius,
    expires_at: expires_at_iso,
    creator_id: auth.user.id,
  };

  const { error: hubErr } = await admin.from('hub_venues').insert(hubRow);
  if (hubErr) {
    console.error('hub/create hub_venues:', hubErr.message);
    return NextResponse.json({ error: 'Failed to create hub', detail: hubErr.message }, { status: 500 });
  }

  const { error: partErr } = await admin.from('hub_participants').insert({
    hub_id: hubId,
    user_id: auth.user.id,
  });
  if (partErr) {
    console.error('hub/create hub_participants:', partErr.message);
    await admin.from('hub_venues').delete().eq('id', hubId);
    return NextResponse.json({ error: 'Failed to register hub participant', detail: partErr.message }, { status: 500 });
  }

  return NextResponse.json({
    hub_id: hubId,
    expires_at: expires_at_iso,
  });
}
