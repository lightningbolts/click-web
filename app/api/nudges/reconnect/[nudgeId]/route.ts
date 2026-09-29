import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { placeCell } from '@/lib/nudges/reconnectNearby';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { emitProductEvent } from '@/lib/server/telemetry/productEvents';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  action: z.enum(['acted', 'dismissed']),
  /** With a dismissal: stop nudging about this person, or at this place. */
  mute: z.enum(['person', 'place']).optional(),
});

/**
 * POST /api/nudges/reconnect/{id} { action: 'acted' | 'dismissed', mute? } — the viewer tapped
 * through (reach out) or dismissed the card, optionally muting the person or the place.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ nudgeId: string }> }): Promise<Response> {
  try {
    const { nudgeId } = await params;
    if (!UUID_RE.test(nudgeId)) return NextResponse.json({ error: 'Invalid nudge id' }, { status: 400 });
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const parsed = await parseBody(request, bodySchema);
    if (!parsed.ok) return parsed.response;
    const admin = createAdminSupabaseClient();

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from('place_nudges')
      .update(parsed.data.action === 'acted' ? { acted_at: now } : { dismissed_at: now })
      .eq('id', nudgeId)
      .eq('user_id', user.id)
      .select('connection_id, encounter_id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as { connection_id: string; encounter_id: string | null } | null;
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (parsed.data.action === 'acted') {
      runAfterResponse('product events', () => emitProductEvent(admin, user.id, 'nudge_acted', { kind: 'reconnect_nearby' }));
    }

    if (parsed.data.action === 'dismissed' && parsed.data.mute) {
      let targetId: string | null = null;
      if (parsed.data.mute === 'person') {
        const { data: conn } = await admin.from('connections').select('user_ids').eq('id', row.connection_id).maybeSingle();
        targetId = ((conn as { user_ids?: string[] } | null)?.user_ids ?? []).find((id) => id !== user.id) ?? null;
      } else if (row.encounter_id) {
        const { data: enc } = await admin.from('connection_encounters').select('gps_lat, gps_lon').eq('id', row.encounter_id).maybeSingle();
        const e = enc as { gps_lat: number | null; gps_lon: number | null } | null;
        if (e?.gps_lat != null && e.gps_lon != null) targetId = placeCell(Number(e.gps_lat), Number(e.gps_lon));
      }
      if (targetId) {
        const { error: muteError } = await admin
          .from('nudge_mutes')
          .upsert({ user_id: user.id, target_type: parsed.data.mute, target_id: targetId }, { onConflict: 'user_id,target_type,target_id', ignoreDuplicates: true });
        if (muteError) throw new Error(muteError.message);
      }
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('POST /api/nudges/reconnect/[nudgeId]:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
