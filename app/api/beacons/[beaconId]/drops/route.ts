import { NextRequest, NextResponse } from 'next/server';
import { parseBody } from '@/lib/api/parseBody';
import { eventDropCreateBodySchema } from '@/lib/api/schemas/drops';
import { featureMutationRateLimitResponse } from '@/lib/server/rateLimit';
import { isEventDropWindowOpen } from '@/lib/events/eventDropSchedule';
import {
  EVENT_DROP_MAX_ORIGINAL_BYTES,
  EVENT_DROP_MAX_PREVIEW_BYTES,
  authorizeEventDropRequest,
  eventDropAccess,
  findEventDropByClientId,
  insertEventDrop,
  loadEventRole,
  posterAbsenteeSetting,
  serializeEventDrops,
  visibleEventDrops,
} from '@/lib/server/eventDrops';

export const maxDuration = 60;
export const runtime = 'nodejs';

type Params = { params: Promise<{ beaconId: string }> };

/**
 * GET /api/beacons/{id}/drops — the event's Click Drops for this viewer (spec F1):
 * `{ state, opens_at, closes_at, reveal_at, access, can_post, remaining, show_to_absentees, drops }`.
 * `state`: before | open | developing | revealed. Previews are always pixelated; originals come
 * from /api/drops/develop (opening the recap develops them all).
 */
export async function GET(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const auth = await authorizeEventDropRequest(request, (await params).beaconId);
    if (!auth.ok) return auth.response;
    const { admin, event, userId, config } = auth;
    const now = Date.now();
    const role = await loadEventRole(admin, event, userId);
    const [rows, showToAbsentees] = await Promise.all([
      visibleEventDrops(admin, event, userId, role, config, now),
      posterAbsenteeSetting(admin, event.id, userId),
    ]);
    const { schedule } = event;
    const windowOpen = isEventDropWindowOpen(schedule, now);
    const mine = rows.filter((r) => r.user_id === userId).length;
    return NextResponse.json(
      {
        state:
          now < schedule.opensAtMs ? 'before' : windowOpen ? 'open' : now < schedule.revealAtMs ? 'developing' : 'revealed',
        opens_at: new Date(schedule.opensAtMs).toISOString(),
        closes_at: new Date(schedule.closesAtMs).toISOString(),
        reveal_at: new Date(schedule.revealAtMs).toISOString(),
        event_title: event.title,
        access: eventDropAccess(role),
        can_post: windowOpen && role.checkedIn && mine < config.perUserCap,
        remaining: role.checkedIn ? Math.max(0, config.perUserCap - mine) : 0,
        show_to_absentees: showToAbsentees,
        drops: await serializeEventDrops(admin, rows, userId),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('GET /api/beacons/[beaconId]/drops:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function decode(b64: string, maxBytes: number): Buffer | null {
  if (b64.length > Math.ceil(maxBytes / 3) * 4 + 4) return null;
  const buffer = Buffer.from(b64, 'base64');
  return buffer.length > 0 && buffer.length <= maxBytes ? buffer : null;
}

/**
 * POST /api/beacons/{id}/drops — post an event drop (checked-in attendees, inside the window, up to
 * the cap). Retrying with the same `client_drop_id` returns the drop already made.
 */
export async function POST(request: NextRequest, { params }: Params): Promise<Response> {
  try {
    const auth = await authorizeEventDropRequest(request, (await params).beaconId);
    if (!auth.ok) return auth.response;
    const { admin, event, userId } = auth;
    const limited = await featureMutationRateLimitResponse('event_drops', userId);
    if (limited) return limited;
    const parsed = await parseBody(request, eventDropCreateBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const existing = await findEventDropByClientId(admin, userId, body.client_drop_id);
    if (existing) return NextResponse.json({ drop: (await serializeEventDrops(admin, [existing], userId))[0] });

    if (!isEventDropWindowOpen(event.schedule, Date.now())) {
      return NextResponse.json({ error: 'Drops for this event are closed.', code: 'window_closed' }, { status: 403 });
    }
    const role = await loadEventRole(admin, event, userId);
    if (!role.checkedIn) {
      return NextResponse.json({ error: 'Check in to this event to add drops.', code: 'not_checked_in' }, { status: 403 });
    }
    const original = decode(body.original_b64, EVENT_DROP_MAX_ORIGINAL_BYTES);
    const preview = decode(body.preview_b64, EVENT_DROP_MAX_PREVIEW_BYTES);
    if (!original || !preview) {
      return NextResponse.json({ error: 'Photo is empty or too large.', code: 'invalid_media' }, { status: 413 });
    }

    const result = await insertEventDrop(admin, {
      event,
      userId,
      clientDropId: body.client_drop_id,
      mimeType: body.mime_type,
      original,
      preview,
      width: body.width ?? null,
      height: body.height ?? null,
      showToAbsentees: body.show_to_absentees ?? (await posterAbsenteeSetting(admin, event.id, userId)),
    });
    if ('error' in result) {
      if (result.error === 'cap_reached') {
        return NextResponse.json({ error: "You've added all your drops for this event.", code: 'cap_reached' }, { status: 409 });
      }
      if (result.error === 'duplicate') {
        const again = await findEventDropByClientId(admin, userId, body.client_drop_id);
        if (again) return NextResponse.json({ drop: (await serializeEventDrops(admin, [again], userId))[0] });
      }
      return NextResponse.json({ error: 'Failed to save the drop. Try again.' }, { status: 500 });
    }
    return NextResponse.json({ drop: (await serializeEventDrops(admin, [result.row], userId))[0] }, { status: 201 });
  } catch (e) {
    console.error('POST /api/beacons/[beaconId]/drops:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
