import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest, cronPushBearer, pushFunctionUrl } from '@/lib/server/cronAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { runChatDropsReady } from '@/lib/cron/dropsReady';

/**
 * GET /api/cron/drops — hourly (via cron-hourly-maintenance): batched "ready to develop" pushes
 * for gated Click Drops.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const chat = await runChatDropsReady(createAdminClient(), pushFunctionUrl(), cronPushBearer());
    return NextResponse.json({ ok: true, chat });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/drops]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
