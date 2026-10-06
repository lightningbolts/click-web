import { NextRequest } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { EVENT_BEACON_UUID_RE } from '@/lib/server/eventEngagement';
import { loadPublicEventPayload } from '@/lib/events/publicEvent';
import {
  buildWalletPass,
  eventPassKey,
  isGoing,
  issueEventPass,
  loadPassHolder,
  walletConfig,
  walletPassJson,
} from '@/lib/server/eventPass';
import { cssRgb, passArt } from '@/lib/server/wallet/passArt';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — the attendee's Click Pass as a signed Apple Wallet pass (`.pkpass`). It carries the same
 * credential as the in-app QR, so either one checks them in.
 * 404 `wallet_unavailable` until the Pass Type ID certificate is configured (see .env.example).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ beaconId: string }> }) {
  try {
    const { beaconId } = await params;
    if (!EVENT_BEACON_UUID_RE.test(beaconId)) return apiError('Invalid beacon id', 400);
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return apiError('Unauthorized', 401);

    const config = walletConfig();
    const key = eventPassKey();
    if (!config || !key) return apiError('Apple Wallet passes are not available', 404, 'wallet_unavailable');

    const admin = createAdminSupabaseClient();
    const [event, going] = await Promise.all([
      loadPublicEventPayload(admin, beaconId),
      isGoing(admin, beaconId, user.id),
    ]);
    if (!event) return apiError('Event not found', 404);
    if (!going) return apiError('RSVP to get a Click Pass', 403, 'not_going');

    const [holder, art] = await Promise.all([loadPassHolder(admin, user.id), passArt(event)]);
    const pass = issueEventPass(key, beaconId, user.id);
    const passJson = walletPassJson({ config, event, pass, holder, backgroundColor: cssRgb(art.backgroundColor) });
    const body = await buildWalletPass(config, passJson, art.images);
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="click-pass.pkpass"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('GET /api/beacons/[beaconId]/pass/wallet:', e);
    return apiError('Could not create the Wallet pass', 500);
  }
}
