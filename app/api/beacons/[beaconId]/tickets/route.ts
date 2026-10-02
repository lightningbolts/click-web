import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { eventTitleFromMetadata, parseBeaconMetadata } from '@/lib/events/eventMetadata';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

type TicketRow = {
  id: string;
  status: string;
  ticket_number: string;
  issued_at: string;
  checked_in_at: string | null;
  ticket_tier_id: string;
  ticket_tiers: { name: string } | { name: string }[] | null;
};

function tierName(t: TicketRow): string | null {
  const joined = t.ticket_tiers;
  if (Array.isArray(joined)) return joined[0]?.name ?? null;
  return joined?.name ?? null;
}

/** Read-only wallet projection; credentials are minted only by the explicit POST route. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId } = await params;
  if (!UUID_RE.test(beaconId)) {
    return NextResponse.json({ error: 'Invalid beacon id' }, { status: 400 });
  }

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();

  const { data, error } = await admin
    .from('tickets')
    .select(
      'id, status, ticket_number, issued_at, checked_in_at, ticket_tier_id, ticket_tiers ( name )',
    )
    .eq('beacon_id', beaconId)
    .eq('owner_user_id', user.id)
    .order('issued_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
  }

  const { data: event } = data?.length
    ? await admin.from('map_beacons').select('metadata').eq('id', beaconId).maybeSingle()
    : { data: null };
  const eventName = eventTitleFromMetadata(parseBeaconMetadata(event?.metadata)) ?? 'Event';
  const tickets = [];
  for (const row of (data as TicketRow[]) ?? []) {
    tickets.push({
      event_name: eventName,
      id: row.id,
      status: row.status,
      ticket_number: row.ticket_number,
      tier_name: tierName(row),
      issued_at: row.issued_at,
      checked_in_at: row.checked_in_at,
    });
  }

  return NextResponse.json({ tickets }, { headers: { 'Cache-Control': 'private, no-store' } });
}
