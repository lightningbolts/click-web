import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { rematchGuestList } from '@/lib/events/guestListService';

/**
 * POST /api/beacons/{id}/guest-list/match — rematch latest guest list and regenerate teasers.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const auth = await requireEventManager(request, beaconId);
    if (!auth.ok) return auth.response;
    const status = await rematchGuestList(auth.admin, beaconId);
    if (!status) {
      return NextResponse.json({ error: 'No guest list uploaded' }, { status: 404 });
    }
    return NextResponse.json(status);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Match failed';
    console.error('POST /api/beacons/[beaconId]/guest-list/match:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
