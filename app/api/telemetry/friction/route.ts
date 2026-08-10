import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

type FrictionBody = {
  event?: unknown;
  event_type?: unknown;
  duration_sec?: unknown;
  pan_count?: unknown;
  action_taken?: unknown;
  hexbin_id?: unknown;
};

const ALLOWED_EVENTS = new Set(['map_friction_anomaly']);

function sanitizeHexbinId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (/[0-9]+\.[0-9]+/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Ingest anonymized map friction telemetry from the KMP client.
 * Auth validates the session; no user_id or coordinates are persisted.
 */
export async function POST(request: NextRequest) {
  const { authError } = await getSupabaseFromRouteRequest(request);
  if (authError != null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: FrictionBody;
  try {
    body = (await request.json()) as FrictionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawEvent =
    typeof body.event === 'string'
      ? body.event
      : typeof body.event_type === 'string'
        ? body.event_type
        : '';
  const eventType = rawEvent.trim();
  if (!ALLOWED_EVENTS.has(eventType)) {
    return NextResponse.json({ error: 'Unsupported event type' }, { status: 400 });
  }

  const durationSec =
    typeof body.duration_sec === 'number' && Number.isFinite(body.duration_sec)
      ? Math.max(0, Math.floor(body.duration_sec))
      : null;

  const panCount =
    typeof body.pan_count === 'number' && Number.isFinite(body.pan_count)
      ? Math.max(0, Math.floor(body.pan_count))
      : null;

  const hexbinId = sanitizeHexbinId(body.hexbin_id);

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('system_friction_logs').insert({
    event_type: eventType,
    duration_sec: durationSec,
    pan_count: panCount,
    hexbin_id: hexbinId,
  });

  if (error) {
    console.error('[telemetry/friction]', error.message);
    return NextResponse.json({ error: 'Failed to record friction log' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
