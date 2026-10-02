import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { parseBody } from '@/lib/api/parseBody';
import { ticketingStatusBodySchema } from '@/lib/api/schemas/ticketing';
export const runtime = 'nodejs';
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;
  const { beaconId } = await params;
  const manager = await requireEventManager(request, beaconId);
  if (!manager.ok) return manager.response;
  const body = await parseBody(request, ticketingStatusBodySchema);
  if (!body.ok) return body.response;
  const { data, error } = await manager.admin.rpc('ticketing_set_status', {
    p_beacon: beaconId,
    p_actor: manager.userId,
    p_patch: body.data,
  });
  if (error) return NextResponse.json({ error: 'Could not update sales' }, { status: 500 });
  return NextResponse.json(data, { status: data?.ok ? 200 : 409 });
}
