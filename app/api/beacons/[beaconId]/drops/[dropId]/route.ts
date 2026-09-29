import { NextRequest, NextResponse } from 'next/server';
import { authorizeEventDropRequest, deleteEventDrop } from '@/lib/server/eventDrops';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DELETE /api/beacons/{id}/drops/{dropId} — the poster removes their drop, any time (after reveal too). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string; dropId: string }> },
): Promise<Response> {
  try {
    const { beaconId, dropId } = await params;
    if (!UUID_RE.test(dropId)) return NextResponse.json({ error: 'Invalid drop id' }, { status: 400 });
    const auth = await authorizeEventDropRequest(request, beaconId);
    if (!auth.ok) return auth.response;
    const deleted = await deleteEventDrop(auth.admin, dropId, auth.userId);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/beacons/[beaconId]/drops/[dropId]:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
