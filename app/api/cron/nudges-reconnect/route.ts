import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest, cronPushBearer } from '@/lib/server/cronAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { runReconnectNudges } from '@/lib/cron/nudgesReconnect';
import { runRelationshipMoments } from '@/lib/cron/relationshipMoments';
import { runtimeEnv } from '@/lib/server/runtimeEnv';


const pushFunctionUrl = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')
  ? `${runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')}/functions/v1/send-push-notification`
  : null;

/**
 * GET /api/cron/nudges-reconnect — hourly reconnect-lull scan + push, then relationship moments
 * (anniversaries, memory prompts, group revival, hangout expiry).
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
    const result = await runReconnectNudges(admin, pushFunctionUrl, cronPushBearer() ?? '');
    const moments = await runRelationshipMoments(admin, pushFunctionUrl, cronPushBearer());
    return NextResponse.json({ ok: true, ...result, moments });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/nudges-reconnect]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
