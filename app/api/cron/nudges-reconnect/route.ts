import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { runReconnectNudges } from '@/lib/cron/nudgesReconnect';
import { runtimeEnv } from '@/lib/server/runtimeEnv';

const CRON_SECRET = process.env.CRON_SECRET;

const pushFunctionUrl = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')
  ? `${runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')}/functions/v1/send-push-notification`
  : null;

/**
 * GET /api/cron/nudges-reconnect — hourly reconnect-lull scan + push.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!pushFunctionUrl) {
    return NextResponse.json({ error: 'Missing push URL' }, { status: 500 });
  }
  const admin = createAdminClient();
  try {
    const result = await runReconnectNudges(admin, pushFunctionUrl, CRON_SECRET);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/nudges-reconnect]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
