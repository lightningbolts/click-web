import { NextRequest, NextResponse } from 'next/server';
import { parseBody } from '@/lib/api/parseBody';
import { eventDropSettingsBodySchema } from '@/lib/api/schemas/drops';
import { authorizeEventDropRequest } from '@/lib/server/eventDrops';

/**
 * PUT /api/beacons/{id}/drops/settings { show_to_absentees } — whether this poster's drops for this
 * event may appear in "What you missed" for people who RSVP'd but couldn't make it (default on).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ beaconId: string }> }): Promise<Response> {
  try {
    const auth = await authorizeEventDropRequest(request, (await params).beaconId);
    if (!auth.ok) return auth.response;
    const parsed = await parseBody(request, eventDropSettingsBodySchema);
    if (!parsed.ok) return parsed.response;
    const { error } = await auth.admin
      .from('event_drops')
      .update({ show_to_absentees: parsed.data.show_to_absentees })
      .eq('beacon_id', auth.event.id)
      .eq('user_id', auth.userId)
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    return NextResponse.json({ show_to_absentees: parsed.data.show_to_absentees });
  } catch (e) {
    console.error('PUT /api/beacons/[beaconId]/drops/settings:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
