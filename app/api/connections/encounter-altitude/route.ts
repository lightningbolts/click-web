/**
 * POST /api/connections/encounter-altitude
 * Fills the caller's own encounter rows with the barometric altitude their phone measured a
 * few seconds after the connection (see `lib/server/encounterAltitudeFollowUp`).
 * Body: { connection_ids, connection_moment, observed_at, exact_barometric_elevation_m,
 *         barometric_accuracy_m?, barometric_precision_m? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { parseBody } from '@/lib/api/parseBody';
import { encounterAltitudeBodySchema } from '@/lib/api/schemas/connections';
import { applyAltitudeFollowUp } from '@/lib/server/encounterAltitudeFollowUp';

export async function POST(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseBody(request, encounterAltitudeBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const result = await applyAltitudeFollowUp(createAdminClient(), user.id, {
      connectionIds: [...new Set(body.connection_ids)],
      connectionMoment: body.connection_moment,
      observedAt: body.observed_at,
      altitudeM: body.exact_barometric_elevation_m,
      accuracyM: body.barometric_accuracy_m ?? null,
      precisionM: body.barometric_precision_m ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ updated: result.updated });
  } catch (error) {
    console.error('encounter altitude follow-up:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
