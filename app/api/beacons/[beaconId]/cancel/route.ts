import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { cancelTicketedEvent } from '@/lib/server/ticketing/cancelEvent';
import { revalidatePublicEvents } from '@/lib/server/events/revalidatePublicEvents';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The organizer cancels the event. It stays visible with a cancelled banner; free tickets are
 * voided and paid orders refunded in full. Refunds that fail now are retried by the cron.
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

  try {
    return NextResponse.json(await cancelTicketedEvent(manager.admin, beaconId, manager.userId));
  } catch (e) {
    console.error('Event cancel failed:', e);
    return apiError('Failed to cancel event', 500);
  } finally {
    // The cancel may have committed before a later step failed: never leave "Get tickets" up.
    revalidatePublicEvents(beaconId, manager.beacon.venue_id ?? null);
  }
}
