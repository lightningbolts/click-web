import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';

const CRON_SECRET = process.env.CRON_SECRET;

type ExpiredIntentRow = {
  id: string;
  user_id: string;
  starts_at: string | null;
  expires_at: string;
  anonymized_cell_id: string | null;
};

/**
 * Hourly sweep: availability intents that expired with zero linked encounters
 * during their window → `failed_conversion` friction logs (aggregated, no user_id).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const { data: expiredIntents, error: fetchError } = await admin
    .from('availability_intents')
    .select('id, user_id, starts_at, expires_at, anonymized_cell_id')
    .lte('expires_at', nowIso)
    .gte('expires_at', windowStart);

  if (fetchError) {
    console.error('[cron/friction-intent-expirations] fetch:', fetchError.message);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const rows = (expiredIntents ?? []) as ExpiredIntentRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, logged: 0 });
  }

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const { data: connections, error: connError } = await admin
    .from('connections')
    .select('id, user_ids')
    .overlaps('user_ids', userIds);

  if (connError) {
    console.error('[cron/friction-intent-expirations] connections:', connError.message);
    return NextResponse.json({ error: connError.message }, { status: 500 });
  }

  const connectionIdsByUser = new Map<string, string[]>();
  for (const conn of connections ?? []) {
    const ids = (conn.user_ids as string[] | null) ?? [];
    for (const uid of ids) {
      const list = connectionIdsByUser.get(uid) ?? [];
      list.push(conn.id as string);
      connectionIdsByUser.set(uid, list);
    }
  }

  const allConnectionIds = [...new Set((connections ?? []).map((c) => c.id as string))];
  const encountersByConnection = new Map<string, { encountered_at: string }[]>();

  if (allConnectionIds.length > 0) {
    const { data: encounters, error: encError } = await admin
      .from('connection_encounters')
      .select('connection_id, encountered_at')
      .in('connection_id', allConnectionIds)
      .gte('encountered_at', windowStart);

    if (encError) {
      console.error('[cron/friction-intent-expirations] encounters:', encError.message);
      return NextResponse.json({ error: encError.message }, { status: 500 });
    }

    for (const enc of encounters ?? []) {
      const cid = enc.connection_id as string;
      const list = encountersByConnection.get(cid) ?? [];
      list.push({ encountered_at: enc.encountered_at as string });
      encountersByConnection.set(cid, list);
    }
  }

  const frictionRows: {
    event_type: string;
    duration_sec: number | null;
    pan_count: number | null;
    hexbin_id: string | null;
  }[] = [];

  for (const intent of rows) {
    const startMs = Date.parse(intent.starts_at ?? intent.expires_at);
    const endMs = Date.parse(intent.expires_at);
    const durationSec =
      Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
        ? Math.floor((endMs - startMs) / 1000)
        : null;

    const userConnIds = connectionIdsByUser.get(intent.user_id) ?? [];
    const hadEncounter = userConnIds.some((cid) => {
      const encs = encountersByConnection.get(cid) ?? [];
      return encs.some((e) => {
        const t = Date.parse(e.encountered_at);
        return Number.isFinite(t) && t >= startMs && t <= endMs;
      });
    });

    if (hadEncounter) continue;

    frictionRows.push({
      event_type: 'failed_conversion',
      duration_sec: durationSec,
      pan_count: null,
      hexbin_id: intent.anonymized_cell_id?.trim() || null,
    });
  }

  if (frictionRows.length > 0) {
    const { error: insertError } = await admin.from('system_friction_logs').insert(frictionRows);
    if (insertError) {
      console.error('[cron/friction-intent-expirations] insert:', insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, logged: frictionRows.length });
}
