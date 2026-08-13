import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { runAvailabilityMatchPushes } from '@/lib/cron/availabilityMatches';
import { runtimeEnv } from '@/lib/server/runtimeEnv';

const CRON_SECRET = process.env.CRON_SECRET;

const pushFunctionUrl = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')
  ? `${runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')}/functions/v1/send-push-notification`
  : null;

/**
 * Hourly availability-intent match pushes.
 * Production scheduling: cron-hourly-maintenance → this route.
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
    const result = await runAvailabilityMatchPushes(admin, pushFunctionUrl, CRON_SECRET);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/availability-matches]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
