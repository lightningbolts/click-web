import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { decodeAttendeeCursor, searchAttendees } from '@/lib/server/ticketing/organizer';
import { apiError } from '@/lib/api/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ticket holders for the organizer list: `?q=` name or ticket number, `?cursor=` next page. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;

  const { beaconId } = await params;
  const manager = await requireEventManager(request, beaconId, { allowViewers: true });
  if (!manager.ok) return manager.response;

  const search = request.nextUrl.searchParams;
  const cursor = decodeAttendeeCursor(search.get('cursor'));
  if (cursor === 'invalid') return apiError('Invalid cursor', 400);
  const query = (search.get('q') ?? '').slice(0, 100);

  try {
    return NextResponse.json(await searchAttendees(manager.admin, beaconId, query, cursor, manager.access));
  } catch (e) {
    console.error('Attendee search failed:', e);
    return apiError('Failed to load attendees', 500);
  }
}
