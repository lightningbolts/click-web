import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { hashTicketToken } from '@/lib/server/ticketing/credentials';
import { parseBody } from '@/lib/api/parseBody';
import { checkInBodySchema } from '@/lib/api/schemas/ticketing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Organizer/staff scan of a ticket QR credential. Server-authoritative and
 * atomic: the RPC row-locks the ticket so exactly one concurrent scan wins;
 * every scan — accepted or rejected — is appended to the check-in log.
 * Scanner authorization is re-checked on every call, not just when the
 * scanner screen opened.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId } = await params;
  const manager = await requireEventManager(request, beaconId);
  if (!manager.ok) return manager.response;

  const parsed = await parseBody(request, checkInBodySchema);
  if (!parsed.ok) return parsed.response;

  // Accept either the bare token or the full QR URL form (…/t/<token>).
  const raw = parsed.data.credential.trim();
  const token = raw.includes('/t/') ? raw.slice(raw.lastIndexOf('/t/') + 3) : raw;

  const { data, error } = await manager.admin.rpc('ticketing_check_in', {
    p_beacon: beaconId,
    p_token_hash: hashTicketToken(token),
    p_scanner: manager.userId,
    p_device: parsed.data.device_metadata ?? null,
  });
  if (error) {
    console.error('ticketing_check_in failed:', error.message);
    return NextResponse.json({ error: 'Check-in failed' }, { status: 500 });
  }

  return NextResponse.json(data);
}
