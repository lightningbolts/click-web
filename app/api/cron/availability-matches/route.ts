import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest, cronPushBearer } from '@/lib/server/cronAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { runAvailabilityMatchPushes } from '@/lib/cron/availabilityMatches';
import { runtimeEnv } from '@/lib/server/runtimeEnv';


const pushFunctionUrl = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')
  ? `${runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')}/functions/v1/send-push-notification`
  : null;

/**
 * Hourly availability-intent match pushes.
 * Production scheduling: cron-hourly-maintenance → this route.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!pushFunctionUrl) {
    return NextResponse.json({ error: 'Missing push URL' }, { status: 500 });
  }

  const admin = createAdminClient();
  try {
    const result = await runAvailabilityMatchPushes(admin, pushFunctionUrl, cronPushBearer() ?? '');
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/availability-matches]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
