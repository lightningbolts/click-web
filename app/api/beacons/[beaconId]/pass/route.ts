import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadEventBeaconOrResponse } from '@/lib/server/eventEngagement';
import { activeCheckIn, eventPassKey, isGoing, issueEventPass, walletConfig } from '@/lib/server/eventPass';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — the signed-in attendee's Click Pass for this event: the QR credential, its short code,
 * whether they're checked in, and whether an Apple Wallet copy can be issued.
 * 403 `not_going` for anyone without an approved RSVP (requests and waitlists get one on approval).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ beaconId: string }> }) {
  try {
    const { beaconId } = await params;
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return apiError('Unauthorized', 401);

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ('response' in loaded) return loaded.response;

    const key = eventPassKey();
    if (!key) return apiError('Click Pass is not configured', 503, 'pass_unavailable');
    if (!(await isGoing(admin, beaconId, user.id))) {
      return apiError('RSVP to get a Click Pass', 403, 'not_going');
    }

    const pass = issueEventPass(key, beaconId, user.id);
    return NextResponse.json(
      {
        credential_url: pass.url,
        code: pass.code,
        checked_in_at: await activeCheckIn(admin, beaconId, user.id),
        wallet_available: walletConfig() != null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    console.error('GET /api/beacons/[beaconId]/pass:', e);
    return apiError('Could not load your Click Pass', 500);
  }
}
