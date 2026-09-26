/**
 * Hourly maintenance (Supabase pg_cron — not Vercel):
 *   1. Click Drops reveal pushes after collaboration_ttl
 *   2. Event beacon day-of + 30-minutes-before reminders and Seed-a-Room teasers (via click-web /api/cron/event-reminders)
 *   2b. Encounter reconnect / shared-event nudges (via click-web /api/cron/nudges-reconnect)
 *   3. failed_conversion rows in system_friction_logs for expired availability intents
 *   4. Delete expired pending_handshakes (expires_at < now())
 *
 * Deploy (the gateway requires at least the project's anon key):
 *   supabase functions deploy cron-hourly-maintenance
 *
 * Triggered hourly by pg_cron with the public anon key (see 20260926090000_relationship_moments
 * .sql). Any caller that passes the gateway is fine: `claim_cron_run` lets at most one run start
 * per 50 minutes, and every job below is idempotent. click-web is called with the service role
 * key Supabase injects here.
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

async function runDisposableReveal(
  admin: ReturnType<typeof createClient>,
): Promise<{ sessions: number; pushAttempts: number }> {
  const nowIso = new Date().toISOString();
  const pushUrl = `${SUPABASE_URL}/functions/v1/send-push-notification`;

  // Sessions that revealed more than a day ago are closed out silently: a "revealed!" push for
  // an old Drop is noise (this matters when the sweep first runs or resumes after downtime).
  const staleIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error: staleError } = await admin
    .from('collaboration_sessions')
    .update({ notification_sent: true })
    .lt('collaboration_ttl', staleIso)
    .eq('notification_sent', false);
  if (staleError) {
    throw new Error(`disposable-reveal stale: ${staleError.message}`);
  }

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

async function runClickWebCron(path: string, label: string): Promise<Record<string, unknown>> {
  const base = (
    Deno.env.get('CLICK_WEB_URL') ??
    Deno.env.get('CLICK_WEB_BASE_URL') ??
    'https://joinclick.co'
  ).replace(/\/$/, '');
  const secret = SERVICE_ROLE_KEY || CRON_SECRET;
  if (!secret) {
    throw new Error(`${label}: missing SUPABASE_SERVICE_ROLE_KEY`);
  }
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.json().catch(() => ({ error: 'invalid json' }));
  if (!response.ok) {
    throw new Error(
      `${label} web: ${response.status} ${typeof body === 'object' ? JSON.stringify(body) : String(body)}`,
    );
  }
  return typeof body === 'object' && body != null ? (body as Record<string, unknown>) : {};
}

async function runEventRemindersViaWeb(): Promise<{ scanned: number; pushAttempts: number }> {
  const body = await runClickWebCron('/api/cron/event-reminders', 'event-reminders');
  const scanned = typeof body.scanned === 'number' ? body.scanned : 0;
  const pushAttempts = typeof body.pushAttempts === 'number' ? body.pushAttempts : 0;
  return { scanned, pushAttempts };
}

async function runAvailabilityMatchesViaWeb(): Promise<{ scanned: number; pushAttempts: number }> {
  const body = await runClickWebCron('/api/cron/availability-matches', 'availability-matches');
  const scanned = typeof body.scanned === 'number' ? body.scanned : 0;
  const pushAttempts = typeof body.pushAttempts === 'number' ? body.pushAttempts : 0;
  return { scanned, pushAttempts };
}

async function runPendingHandshakesCleanup(
  admin: ReturnType<typeof createClient>,
): Promise<{ deleted: number }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('pending_handshakes')
    .delete()
    .lt('expires_at', nowIso)
    .select('id');

  if (error) {
    throw new Error(`pending-handshakes-cleanup: ${error.message}`);
  }

  return { deleted: data?.length ?? 0 };
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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: claimed, error: claimError } = await admin.rpc('claim_cron_run', {
    p_name: 'hourly-maintenance',
    p_min_interval: '50 minutes',
  });
  if (claimError) {
    return new Response(JSON.stringify({ ok: false, error: claimError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (claimed !== true) {
    return new Response(JSON.stringify({ ok: true, skipped: 'ran within the last 50 minutes' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const disposable = await runDisposableReveal(admin);
    const events = await runEventRemindersViaWeb();
    const availability = await runAvailabilityMatchesViaWeb();
    const friction = await runFrictionIntentExpirations(admin);
    const pendingHandshakes = await runPendingHandshakesCleanup(admin);
    const nudges = await runClickWebCron('/api/cron/nudges-reconnect', 'nudges-reconnect');
    const body = { ok: true, disposable, events, availability, friction, pendingHandshakes, nudges };
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
