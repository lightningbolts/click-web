/**
 * Every minute (Supabase pg_cron `click-scheduled-messages`): delivers due scheduled chat
 * messages by calling click-web `/api/cron/scheduled-messages`, which validates, inserts and
 * pushes each one. Kept separate from cron-hourly-maintenance so it runs on its own schedule.
 *
 * Deploy (the gateway requires the project's anon key or better):
 *   supabase functions deploy cron-scheduled-messages
 *
 * Triggering needs no secret: it only delivers messages that are already due, each claimed
 * exactly once. The privileged step (calling click-web with the service role key, which
 * Supabase injects into every function) stays inside this function.
 *
 * Schedule: see migration 20260925120000_scheduled_messages_read_cursors.sql
 */

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SERVICE_ROLE_KEY) return json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY' }, 500);

  const base = (
    Deno.env.get('CLICK_WEB_URL') ??
    Deno.env.get('CLICK_WEB_BASE_URL') ??
    'https://joinclick.co'
  ).replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/api/cron/scheduled-messages`, {
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
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
