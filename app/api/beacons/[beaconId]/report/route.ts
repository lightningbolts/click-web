import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { beaconReportBodySchema } from '@/lib/api/schemas/beacons';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { loadVisibleBeacon } from '@/lib/map/beaconVisibility';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/beacons/{id}/report { reason } — a quiet report into `beacon_reports` for moderation.
 * Not a vote and never shown to anyone; only beacons the reporter can see can be reported.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ beaconId: string }> }) {
  try {
    const { beaconId } = await params;
    if (!UUID_RE.test(beaconId)) return NextResponse.json({ error: 'Invalid beacon id' }, { status: 400 });
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const limited = await featureMutationRateLimitResponse('beacon_report', user.id);
    if (limited) return limited;
    const parsed = await parseBody(request, beaconReportBodySchema);
    if (!parsed.ok) return parsed.response;

    const admin = createAdminSupabaseClient();
    if (!(await loadVisibleBeacon(admin, beaconId, user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { error: insertError } = await admin
      .from('beacon_reports')
      .insert({ beacon_id: beaconId, reporter_id: user.id, reason: parsed.data.reason });
    if (insertError) {
      console.error('POST /api/beacons/[beaconId]/report:', insertError.message);
      return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
    }
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    console.error('POST /api/beacons/[beaconId]/report:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
