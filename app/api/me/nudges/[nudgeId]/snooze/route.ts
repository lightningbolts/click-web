import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { nudgeSnoozeBodySchema } from '@/lib/api/schemas/beacons';
import { EVENT_BEACON_UUID_RE } from '@/lib/events/eventMetadata';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * POST /api/me/nudges/{nudgeId}/snooze — { days: 7 | 30 }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nudgeId: string }> },
) {
  try {
    const { nudgeId } = await params;
    if (!EVENT_BEACON_UUID_RE.test(nudgeId)) {
      return NextResponse.json({ error: 'Invalid nudge id' }, { status: 400 });
    }
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const parsed = await parseBody(request, nudgeSnoozeBodySchema);
    if (!parsed.ok) return parsed.response;
    const days = parsed.data.days === 30 ? 30 : 7;

    const admin = createAdminSupabaseClient();
    const { data: nudge, error: readErr } = await admin
      .from('nudges')
      .select('id, connection_id')
      .eq('id', nudgeId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (readErr) {
      console.error('POST snooze nudge read:', readErr.message);
      return NextResponse.json({ error: 'Failed to snooze' }, { status: 500 });
    }
    if (!isRecord(nudge) || typeof nudge.id !== 'string') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    await admin.from('nudges').update({ dismissed_at: nowIso }).eq('id', nudgeId).eq('user_id', user.id);

    if (typeof nudge.connection_id === 'string') {
      await admin.from('connection_activity_summary').upsert(
        {
          connection_id: nudge.connection_id,
          nudge_snoozed_until: until,
        },
        { onConflict: 'connection_id' },
      );
    }

    return NextResponse.json({ ok: true, snoozed_until: until, days });
  } catch (e) {
    console.error('POST /api/me/nudges/[nudgeId]/snooze:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
