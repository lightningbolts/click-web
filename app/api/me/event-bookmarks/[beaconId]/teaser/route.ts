import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { EVENT_BEACON_UUID_RE } from '@/lib/events/eventMetadata';
import { teaserHeadline, type TeaserPayload } from '@/lib/events/eventTeasers';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function asPayload(raw: unknown): TeaserPayload | null {
  if (!isRecord(raw) || typeof raw.count !== 'number' || raw.count < 1) return null;
  const label = raw.label;
  if (label !== 'interest' && label !== 'org' && label !== 'people you know') return null;
  return {
    count: raw.count,
    label,
    shared_tag: typeof raw.shared_tag === 'string' ? raw.shared_tag : undefined,
  };
}

async function viewerMayReadTeaser(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  beaconId: string,
  userId: string,
): Promise<boolean> {
  const [{ data: bookmark }, { data: rsvp }, { data: matched }] = await Promise.all([
    admin
      .from('event_bookmarks')
      .select('beacon_id')
      .eq('beacon_id', beaconId)
      .eq('user_id', userId)
      .maybeSingle(),
    admin
      .from('beacon_attendees')
      .select('user_id')
      .eq('beacon_id', beaconId)
      .eq('user_id', userId)
      .maybeSingle(),
    admin
      .from('event_guest_list_entries')
      .select('id')
      .eq('matched_user_id', userId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (bookmark != null || rsvp != null) return true;
  if (matched == null) return false;
  const { data: lists } = await admin.from('event_guest_lists').select('id').eq('beacon_id', beaconId);
  const listIds = (lists ?? [])
    .map((r) => (isRecord(r) && typeof r.id === 'string' ? r.id : null))
    .filter((id): id is string => !!id);
  if (listIds.length === 0) return false;
  const { data: onList } = await admin
    .from('event_guest_list_entries')
    .select('id')
    .eq('matched_user_id', userId)
    .in('guest_list_id', listIds)
    .limit(1)
    .maybeSingle();
  return onList != null;
}

/**
 * GET /api/me/event-bookmarks/{beaconId}/teaser — recipient teaser.
 * Allowed if the viewer bookmarked, RSVP'd, or is a matched guest-list entry.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!EVENT_BEACON_UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: 'Invalid beacon id' }, { status: 400 });
    }
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const allowed = await viewerMayReadTeaser(admin, beaconId, user.id);
    if (!allowed) {
      return NextResponse.json({ teaser: null });
    }

    const { data, error } = await admin
      .from('event_teasers')
      .select('id, teaser_type, payload, viewed_at, generated_at')
      .eq('beacon_id', beaconId)
      .eq('recipient_user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('GET teaser:', error.message);
      return NextResponse.json({ error: 'Failed to load teaser' }, { status: 500 });
    }
    if (!isRecord(data) || typeof data.id !== 'string') {
      return NextResponse.json({ teaser: null });
    }
    const payload = asPayload(data.payload);
    if (!payload) return NextResponse.json({ teaser: null });

    if (data.viewed_at == null) {
      await admin
        .from('event_teasers')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', data.id)
        .eq('recipient_user_id', user.id);
    }

    return NextResponse.json({
      teaser: {
        id: data.id,
        teaser_type: data.teaser_type,
        count: payload.count,
        label: payload.label,
        shared_tag: payload.shared_tag ?? null,
        headline: teaserHeadline(payload),
        generated_at: data.generated_at,
      },
    });
  } catch (e) {
    console.error('GET /api/me/event-bookmarks/[beaconId]/teaser:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
