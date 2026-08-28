import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * GET /api/beacons/{id}/teasers — organizer generation status (counts only).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const auth = await requireEventManager(request, beaconId);
    if (!auth.ok) return auth.response;

    const [{ count: teaserCount }, { count: viewedCount }, { data: lists }] = await Promise.all([
      auth.admin.from('event_teasers').select('id', { count: 'exact', head: true }).eq('beacon_id', beaconId),
      auth.admin
        .from('event_teasers')
        .select('id', { count: 'exact', head: true })
        .eq('beacon_id', beaconId)
        .not('viewed_at', 'is', null),
      auth.admin
        .from('event_guest_lists')
        .select('id')
        .eq('beacon_id', beaconId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const listId =
      Array.isArray(lists) && isRecord(lists[0]) && typeof lists[0].id === 'string' ? lists[0].id : null;
    let matched = 0;
    if (listId) {
      const { count } = await auth.admin
        .from('event_guest_list_entries')
        .select('id', { count: 'exact', head: true })
        .eq('guest_list_id', listId)
        .not('matched_user_id', 'is', null);
      matched = count ?? 0;
    }

    return NextResponse.json({
      matched,
      teaser_count: teaserCount ?? 0,
      viewed_count: viewedCount ?? 0,
    });
  } catch (e) {
    console.error('GET /api/beacons/[beaconId]/teasers:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
