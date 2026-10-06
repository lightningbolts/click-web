/**
 * POST /api/connections/encounter-location
 * Replaces the caller's own encounter fix with a tighter one their phone measured in the seconds
 * after the connection, while still (see `lib/server/encounterLocationFollowUp`).
 * Body: { connection_ids, connection_moment, observed_at, gps_lat, gps_lon, gps_horizontal_accuracy_m }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { encounterLocationBodySchema } from '@/lib/api/schemas/connections';
import { applyLocationFollowUp } from '@/lib/server/encounterLocationFollowUp';

export async function POST(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, encounterLocationBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const result = await applyLocationFollowUp(createAdminClient(), user.id, {
      connectionIds: [...new Set(body.connection_ids)],
      connectionMoment: body.connection_moment,
      observedAt: body.observed_at,
      lat: body.gps_lat,
      lon: body.gps_lon,
      accuracyM: body.gps_horizontal_accuracy_m,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ updated: result.updated });
  } catch (error) {
    console.error('encounter location follow-up:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
