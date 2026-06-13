/**
 * Hourly maintenance (Supabase pg_cron — not Vercel):
 *   1. Click Drops reveal pushes after collaboration_ttl
 *   2. Event beacon day-of + one-hour-before reminders
 *   3. failed_conversion rows in system_friction_logs for expired availability intents
 *
 * Deploy:
 *   supabase functions deploy cron-hourly-maintenance --no-verify-jwt
 *
 * Schedule via pg_cron — see migration 20260607120000_pg_cron_hourly_maintenance.sql
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_KEY') ??
  '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

type CollaborationSessionRow = {
  id: string;
  connection_id: string;
  chat_id: string | null;
  participant_user_ids: string[] | null;
};

async function hasRevealedDisposableMessage(
  admin: ReturnType<typeof createClient>,
  session: CollaborationSessionRow,
  nowIso: string,
): Promise<boolean> {
  if (!session.chat_id) return false;
  const { data, error } = await admin
    .from('messages')
    .select('id')
    .eq('chat_id', session.chat_id)
    .eq('metadata->>disposable_roll', 'true')
    .eq('metadata->>encounter_id', session.id)
    .lte('metadata->>collaboration_ttl', nowIso)
    .limit(1);

  if (error) {
    console.warn('[cron-hourly] disposable message reveal check:', session.id, error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

type ExpiredIntentRow = {
  id: string;
  user_id: string;
  starts_at: string | null;
  expires_at: string;
  anonymized_cell_id: string | null;
};

function authorize(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  if (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) return true;
  if (SERVICE_ROLE_KEY && auth === `Bearer ${SERVICE_ROLE_KEY}`) return true;
  return false;
}

async function runDisposableReveal(
  admin: ReturnType<typeof createClient>,
): Promise<{ sessions: number; pushAttempts: number }> {
  const nowIso = new Date().toISOString();
  const pushUrl = `${SUPABASE_URL}/functions/v1/send-push-notification`;

  const { data: sessions, error: fetchError } = await admin
    .from('collaboration_sessions')
    .select('id, connection_id, chat_id, participant_user_ids')
    .lte('collaboration_ttl', nowIso)
    .eq('notification_sent', false);

  if (fetchError) {
    throw new Error(`disposable-reveal fetch: ${fetchError.message}`);
  }

  const rows = (sessions ?? []) as CollaborationSessionRow[];
  let pushAttempts = 0;

  for (const session of rows) {
    const revealed = await hasRevealedDisposableMessage(admin, session, nowIso);
    if (!revealed) continue;

    const participantIds = (session.participant_user_ids ?? []).filter(Boolean);
    for (const userId of participantIds) {
      try {
        const response = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient_user_id: userId,
            title: 'Click Drops',
            body: '📸 Your Click Drop has been revealed!',
            data: {
              type: 'disposable_reveal',
              encounter_id: session.id,
              connection_id: session.connection_id,
              chat_id: session.chat_id,
            },
          }),
        });
        if (response.ok) pushAttempts += 1;
        else console.warn('[cron-hourly] push failed:', userId, await response.text());
      } catch (e) {
        console.warn('[cron-hourly] push error:', userId, e);
      }
    }

    const { error: updateErr } = await admin
      .from('collaboration_sessions')
      .update({ notification_sent: true })
      .eq('id', session.id);

    if (updateErr) {
      console.error('[cron-hourly] mark sent:', session.id, updateErr.message);
    }
  }

  return { sessions: rows.length, pushAttempts };
}

async function runFrictionIntentExpirations(
  admin: ReturnType<typeof createClient>,
): Promise<{ logged: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const { data: expiredIntents, error: fetchError } = await admin
    .from('availability_intents')
    .select('id, user_id, starts_at, expires_at, anonymized_cell_id')
    .lte('expires_at', nowIso)
    .gte('expires_at', windowStart);

  if (fetchError) {
    throw new Error(`friction-intent-expirations fetch: ${fetchError.message}`);
  }

  const rows = (expiredIntents ?? []) as ExpiredIntentRow[];
  if (rows.length === 0) return { logged: 0 };

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const { data: connections, error: connError } = await admin
    .from('connections')
    .select('id, user_ids')
    .overlaps('user_ids', userIds);

  if (connError) {
    throw new Error(`friction-intent-expirations connections: ${connError.message}`);
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
      throw new Error(`friction-intent-expirations encounters: ${encError.message}`);
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
      throw new Error(`friction-intent-expirations insert: ${insertError.message}`);
    }
  }

  return { logged: frictionRows.length };
}

type EventBeaconRow = {
  id: string;
  creator_id: string | null;
  metadata: Record<string, unknown> | null;
};

function parseEventEpochMs(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) ? ms : null;
}

function eventMetadataFlag(meta: Record<string, unknown>, key: string): boolean {
  return meta[key] === true || meta[key] === 'true';
}

async function runEventReminders(
  admin: ReturnType<typeof createClient>,
): Promise<{ scanned: number; pushAttempts: number }> {
  const pushUrl = `${SUPABASE_URL}/functions/v1/send-push-notification`;
  const nowMs = Date.now();
  const windowMs = 15 * 60 * 1000;

  const { data, error } = await admin
    .from('map_beacons')
    .select('id, creator_id, metadata')
    .eq('beacon_type', 'event');

  if (error) {
    throw new Error(`event-reminders fetch: ${error.message}`);
  }

  const rows = (data ?? []) as EventBeaconRow[];
  let pushAttempts = 0;

  for (const row of rows) {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const startMs = parseEventEpochMs(meta.event_start_at ?? meta.eventStartAt);
    const endMs = parseEventEpochMs(meta.event_end_at ?? meta.eventEndAt);
    if (startMs == null || endMs == null || endMs <= nowMs) continue;

    const description =
      (typeof meta.description === 'string' && meta.description.trim()) ||
      (typeof meta.text === 'string' && meta.text.trim()) ||
      'Your event';

    const dayOfStart = Math.floor(startMs / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000;
    const kinds: Array<'day_of' | 'one_hour'> = [];
    if (nowMs >= dayOfStart && nowMs < dayOfStart + windowMs) kinds.push('day_of');
    const oneHourBefore = startMs - 60 * 60 * 1000;
    if (nowMs >= oneHourBefore && nowMs < oneHourBefore + windowMs) kinds.push('one_hour');

    for (const kind of kinds) {
      const sentKey = kind === 'day_of' ? 'day_of_notification_sent' : 'one_hour_notification_sent';
      if (eventMetadataFlag(meta, sentKey)) continue;

      const creatorId = row.creator_id?.trim();
      if (!creatorId) continue;

      const title = kind === 'day_of' ? 'Event today' : 'Event starting soon';
      const body =
        kind === 'day_of'
          ? `${description.slice(0, 80)} starts today — tap to view on the map.`
          : `${description.slice(0, 80)} starts in about an hour.`;

      try {
        const response = await fetch(pushUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient_user_id: creatorId,
            title,
            body,
            data: {
              type: 'event_reminder',
              beacon_id: row.id,
              reminder_kind: kind,
            },
          }),
        });
        if (response.ok) {
          pushAttempts += 1;
          const nextMeta = { ...meta, [sentKey]: true };
          await admin.from('map_beacons').update({ metadata: nextMeta }).eq('id', row.id);
        } else {
          console.warn('[cron-hourly] event push failed:', row.id, kind, await response.text());
        }
      } catch (e) {
        console.warn('[cron-hourly] event push error:', row.id, kind, e);
      }
    }
  }

  return { scanned: rows.length, pushAttempts };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  if (!authorize(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const disposable = await runDisposableReveal(admin);
    const events = await runEventReminders(admin);
    const friction = await runFrictionIntentExpirations(admin);
    const body = { ok: true, disposable, events, friction };
    console.log('[cron-hourly-maintenance]', JSON.stringify(body));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron-hourly-maintenance] fatal:', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
