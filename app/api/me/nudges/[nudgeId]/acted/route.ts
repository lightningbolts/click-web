import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { EVENT_BEACON_UUID_RE } from '@/lib/events/eventMetadata';

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * POST /api/me/nudges/{nudgeId}/acted — marks acted_on_at when the user opens chat from a nudge.
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
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from('nudges')
      .update({ acted_on_at: new Date().toISOString() })
      .eq('id', nudgeId)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('POST acted nudge:', error.message);
      return NextResponse.json({ error: 'Failed to record' }, { status: 500 });
    }
    if (!isRecord(data)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST /api/me/nudges/[nudgeId]/acted:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
