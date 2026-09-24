import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { mintTicketCredential, ticketQrUrl } from '@/lib/server/ticketing/credentials';
import { getAppBaseUrl } from '@/lib/server/stripe';
export const runtime = 'nodejs';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string; ticketId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;
  const { user } = await getSupabaseFromRouteRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { beaconId, ticketId } = await params;
  const minted = mintTicketCredential();
  const { data, error } = await createAdminSupabaseClient()
    .from('tickets')
    .update({ qr_token_hash: minted.tokenHash })
    .eq('id', ticketId)
    .eq('beacon_id', beaconId)
    .eq('owner_user_id', user.id)
    .eq('status', 'valid')
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not issue credential' }, { status: 500 });
  if (!data)
    return NextResponse.json(
      { error: 'Ticket is not valid', code: 'ticket_not_valid' },
      { status: 409 },
    );
  return NextResponse.json(
    { credential_url: ticketQrUrl(getAppBaseUrl(), minted.token) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
