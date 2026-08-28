import { NextRequest, NextResponse } from 'next/server';
import { requireEventManager } from '@/lib/events/requireEventManager';
import { parseBody } from '@/lib/api/parseBody';
import { guestListBodySchema } from '@/lib/api/schemas/beacons';
import {
  loadLatestGuestListStatus,
  persistGuestList,
} from '@/lib/events/guestListService';
import {
  isGuestListSource,
  parseGuestCsv,
  parseGuestEntries,
} from '@/lib/events/guestListParse';

/**
 * GET /api/beacons/{id}/guest-list — organizer status (truncated emails only).
 * POST — upload CSV or manual entries, match, generate teasers.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const auth = await requireEventManager(request, beaconId);
    if (!auth.ok) return auth.response;
    const status = await loadLatestGuestListStatus(auth.admin, beaconId);
    return NextResponse.json(status ?? { uploaded: 0, matched: 0, teasers: 0, entries: [] });
  } catch (e) {
    console.error('GET /api/beacons/[beaconId]/guest-list:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const auth = await requireEventManager(request, beaconId);
    if (!auth.ok) return auth.response;

    const parsed = await parseBody(request, guestListBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const source = isGuestListSource(body.source)
      ? body.source
      : body.csv_text
        ? 'csv'
        : 'manual';
    const entries = body.csv_text
      ? parseGuestCsv(body.csv_text)
      : parseGuestEntries(body.entries ?? []);

    const status = await persistGuestList({
      admin: auth.admin,
      beaconId,
      organizerId: auth.userId,
      source,
      entries,
    });
    return NextResponse.json(status);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to save guest list';
    console.error('POST /api/beacons/[beaconId]/guest-list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
