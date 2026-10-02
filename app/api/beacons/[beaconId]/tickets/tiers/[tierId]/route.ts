import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { parseBody } from '@/lib/api/parseBody';
import { patchTierBodySchema } from '@/lib/api/schemas/ticketing';
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string; tierId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;
  const { beaconId, tierId } = await params;
  const manager = await requireEventManager(request, beaconId);
  if (!manager.ok) return manager.response;
  const body = await parseBody(request, patchTierBodySchema);
  if (!body.ok) return body.response;
  const { data, error } = await manager.admin.rpc('ticketing_patch_tier', {
    p_beacon: beaconId,
    p_tier: tierId,
    p_patch: body.data,
  });
  if (error) return NextResponse.json({ error: 'Could not update tier' }, { status: 500 });
  return NextResponse.json(data, { status: data?.ok ? 200 : 409 });
}
