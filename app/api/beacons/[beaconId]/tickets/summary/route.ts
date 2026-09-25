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
  const { data, error } = await manager.admin.rpc('ticketing_sales_summary', {
    p_beacon: beaconId,
  });
  if (error) return NextResponse.json({ error: 'Could not load summary' }, { status: 500 });
  return NextResponse.json(
    {
      ...data,
      net_before_stripe_fees:
        data.gross - data.platform_fee - data.refunded + (data.refunded_platform_fee ?? 0),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
