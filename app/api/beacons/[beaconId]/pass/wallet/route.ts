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
  issueTicketCredential,
  loadPassHolder,
  walletConfig,
  walletPassJson,
} from '@/lib/server/eventPass';
import { cssRgb, passArt } from '@/lib/server/wallet/passArt';
import { listOwnedTickets } from '@/lib/server/ticketing/ownedTickets';
import { ticketingEnabled } from '@/lib/server/ticketing/enabled';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — the attendee's Click Pass as a signed Apple Wallet pass (`.pkpass`). It carries the same
 * credential as the in-app QR, so either one checks them in. `?ticket={id}` gives one of the
 * viewer's live tickets its own pass instead.
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
    const ticketId = request.nextUrl.searchParams.get('ticket');
    if (ticketId) {
      if (!ticketingEnabled() || !EVENT_BEACON_UUID_RE.test(ticketId)) return apiError('Ticket not found', 404);
      const [event, [ticket]] = await Promise.all([
        loadPublicEventPayload(admin, beaconId),
        listOwnedTickets(admin, user.id, { beaconId, ticketId }),
      ]);
      if (!event) return apiError('Event not found', 404);
      if (!ticket || (ticket.status !== 'valid' && ticket.status !== 'checked_in')) {
        return apiError('Ticket not found', 404);
      }
      const [holder, art] = await Promise.all([loadPassHolder(admin, user.id), passArt(event)]);
      const passJson = walletPassJson({
        config,
        event,
        pass: issueTicketCredential(key, beaconId, ticket.id),
        holder,
        backgroundColor: cssRgb(art.backgroundColor),
        ticket: { id: ticket.id, tierName: ticket.tier_name },
      });
      return pkpass(await buildWalletPass(config, passJson, art.images), 'click-ticket.pkpass');
    }

    const [event, going] = await Promise.all([
      loadPublicEventPayload(admin, beaconId),
      isGoing(admin, beaconId, user.id),
    ]);
    if (!event) return apiError('Event not found', 404);
    if (!going) return apiError('RSVP to get a Click Pass', 403, 'not_going');

    const [holder, art] = await Promise.all([loadPassHolder(admin, user.id), passArt(event)]);
    const pass = issueEventPass(key, beaconId, user.id);
    const passJson = walletPassJson({ config, event, pass, holder, backgroundColor: cssRgb(art.backgroundColor) });
    return pkpass(await buildWalletPass(config, passJson, art.images), 'click-pass.pkpass');
  } catch (e) {
    console.error('GET /api/beacons/[beaconId]/pass/wallet:', e);
    return apiError('Could not create the Wallet pass', 500);
  }
}

function pkpass(body: Buffer, filename: string): Response {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
