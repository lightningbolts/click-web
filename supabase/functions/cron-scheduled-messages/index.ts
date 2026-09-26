/**
 * Every minute (Supabase pg_cron `click-scheduled-messages`): delivers due scheduled chat
 * messages by calling click-web `/api/cron/scheduled-messages`, which validates, inserts and
 * pushes each one. Kept separate from cron-hourly-maintenance so it runs on its own schedule.
 *
 * Deploy:
 *   supabase functions deploy cron-scheduled-messages --no-verify-jwt
 *
 * Schedule: see migration 20260925120000_scheduled_messages_read_cursors.sql
 */

const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('authorization') ?? '';
  const authorized =
    (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) ||
    (SERVICE_ROLE_KEY && auth === `Bearer ${SERVICE_ROLE_KEY}`);
  if (!authorized) return json({ error: 'Unauthorized' }, 401);
  if (!CRON_SECRET) return json({ error: 'Missing CRON_SECRET' }, 500);

  const base = (
    Deno.env.get('CLICK_WEB_URL') ??
    Deno.env.get('CLICK_WEB_BASE_URL') ??
    'https://joinclick.co'
  ).replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/api/cron/scheduled-messages`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const body = await response.json().catch(() => ({ error: 'invalid json' }));
    if (!response.ok) console.error('[cron-scheduled-messages]', response.status, JSON.stringify(body));
    return json(body, response.ok ? 200 : 502);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron-scheduled-messages] fatal:', message);
    return json({ ok: false, error: message }, 500);
  }
});
