import { NextRequest, NextResponse } from 'next/server';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Single HTTP entry point for hourly maintenance (optional — not scheduled on Vercel).
 *
 * Production scheduling uses Supabase pg_cron → `cron-hourly-maintenance` edge function.
 * See click-web/supabase/migrations/20260607120000_pg_cron_hourly_maintenance.sql
 *
 * These routes remain for manual triggers or external schedulers (GitHub Actions, cron-job.org):
 *   GET /api/cron/disposable-reveal
 *   GET /api/cron/friction-intent-expirations
 *   GET /api/cron/event-reminders
 *   GET /api/cron/pending-handshakes-cleanup
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const headers = { Authorization: `Bearer ${CRON_SECRET}` };

  const [disposableRes, frictionRes, eventRes, pendingRes] = await Promise.all([
    fetch(`${origin}/api/cron/disposable-reveal`, { headers, cache: 'no-store' }),
    fetch(`${origin}/api/cron/friction-intent-expirations`, { headers, cache: 'no-store' }),
    fetch(`${origin}/api/cron/event-reminders`, { headers, cache: 'no-store' }),
    fetch(`${origin}/api/cron/pending-handshakes-cleanup`, { headers, cache: 'no-store' }),
  ]);

  const disposable = await disposableRes.json().catch(() => ({ error: 'invalid json' }));
  const friction = await frictionRes.json().catch(() => ({ error: 'invalid json' }));
  const events = await eventRes.json().catch(() => ({ error: 'invalid json' }));
  const pendingHandshakes = await pendingRes.json().catch(() => ({ error: 'invalid json' }));

  if (!disposableRes.ok || !frictionRes.ok || !eventRes.ok || !pendingRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        disposable: { status: disposableRes.status, body: disposable },
        friction: { status: frictionRes.status, body: friction },
        events: { status: eventRes.status, body: events },
        pendingHandshakes: { status: pendingRes.status, body: pendingHandshakes },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    disposable,
    friction,
    events,
    pendingHandshakes,
  });
}
