import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { loadSalesSummary } from '@/lib/server/ticketing/organizer';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ticket sales totals for organizers and Place viewers. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId } = await params;
  const manager = await requireEventManager(request, beaconId, { allowViewers: true });
  if (!manager.ok) return manager.response;

  try {
    return NextResponse.json(await loadSalesSummary(manager.admin, beaconId));
  } catch (e) {
    console.error('Ticket sales summary failed:', e);
    return apiError('Failed to load sales', 500);
  }
}
