import { NextRequest, NextResponse } from 'next/server';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Single entry point for hourly maintenance (Disposable Roll reveal + friction intent sweep).
 *
 * Vercel Hobby cannot register multiple `vercel.json` crons — schedule this route externally
 * (Supabase pg_cron HTTP, GitHub Actions, cron-job.org, etc.) with:
 *   Authorization: Bearer $CRON_SECRET
 *
 * Or invoke the task-specific routes directly:
 *   GET /api/cron/disposable-reveal
 *   GET /api/cron/friction-intent-expirations
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const headers = { Authorization: `Bearer ${CRON_SECRET}` };

  const [disposableRes, frictionRes] = await Promise.all([
    fetch(`${origin}/api/cron/disposable-reveal`, { headers, cache: 'no-store' }),
    fetch(`${origin}/api/cron/friction-intent-expirations`, { headers, cache: 'no-store' }),
  ]);

  const disposable = await disposableRes.json().catch(() => ({ error: 'invalid json' }));
  const friction = await frictionRes.json().catch(() => ({ error: 'invalid json' }));

  if (!disposableRes.ok || !frictionRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        disposable: { status: disposableRes.status, body: disposable },
        friction: { status: frictionRes.status, body: friction },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    disposable,
    friction,
  });
}
