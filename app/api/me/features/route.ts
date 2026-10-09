import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { resolveAllFeatures } from '@/lib/server/featureFlags';
import { hasTicketWallet, ticketingEnabled } from '@/lib/server/ticketing/flags';

/**
 * GET /api/me/features — the signed-in user's resolved feature flags:
 * `{ features: { [key]: { enabled, config } } }`. Unknown or unreadable flags are off.
 *
 * Ticketing rolls out by environment, not cohort, so it joins as two derived entries:
 * `ticket_sales` (buying and organizing) and `ticket_wallet` (your own tickets, which stays on
 * for anyone holding one even while sales are off).
 */
export async function GET(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const admin = createAdminSupabaseClient();
    const [flags, ticketWallet] = await Promise.all([
      resolveAllFeatures(admin, user.id),
      hasTicketWallet(admin, user.id).catch((e) => {
        console.error('GET /api/me/features ticket wallet:', e);
        return false;
      }),
    ]);
    const features = {
      ...flags,
      ticket_sales: { enabled: ticketingEnabled(), config: {} },
      ticket_wallet: { enabled: ticketWallet, config: {} },
    };
    return NextResponse.json({ features }, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    console.error('GET /api/me/features:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
