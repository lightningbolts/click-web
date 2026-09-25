import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;
  const { beaconId } = await params;
  const manager = await requireEventManager(request, beaconId);
  if (!manager.ok) return manager.response;
  const page = Math.max(0, Math.min(10000, Number(request.nextUrl.searchParams.get('page')) || 0));
  const { data, error, count } = await manager.admin
    .from('ticket_orders')
    .select(
      'id,buyer_user_id,currency,total_amount,order_state,fulfillment_state,created_at,ticket_order_items(ticket_tier_id,tier_name_snapshot,quantity,unit_amount),tickets(id,ticket_tier_id,ticket_number,status,checked_in_at),ticket_refunds(id,amount,status,ticket_ids)',
      { count: 'exact' },
    )
    .eq('beacon_id', beaconId)
    .order('created_at', { ascending: false })
    .order('id')
    .range(page * 25, page * 25 + 24);
  if (error) return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
  const ids = [...new Set((data ?? []).map((o) => o.buyer_user_id))];
  const { data: buyers } = ids.length
    ? await manager.admin.from('users').select('id,name,image').in('id', ids)
    : { data: [] };
  const names = new Map((buyers ?? []).map((b) => [b.id, { name: b.name, avatar_url: b.image }]));
  return NextResponse.json(
    {
      orders: (data ?? []).map(({ buyer_user_id, ...o }) => ({
        ...o,
        buyer: names.get(buyer_user_id) ?? { name: 'Attendee', avatar_url: null },
      })),
      page,
      total: count ?? 0,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
