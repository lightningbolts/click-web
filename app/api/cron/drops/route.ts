import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest, cronPushBearer, pushFunctionUrl } from '@/lib/server/cronAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { runChatDropsReady, runEventRecapsReady } from '@/lib/cron/dropsReady';
import { runSharedDropsReleased } from '@/lib/cron/sharedDropsReleased';

/**
 * GET /api/cron/drops — hourly (via cron-hourly-maintenance): batched "ready to develop" pushes
 * for gated Click Drops, "your recap is ready" for event drops, and a backstop for shared-drop
 * release pushes (normally sent within a minute by /api/cron/scheduled-messages).
 */
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const chat = await runChatDropsReady(admin, pushFunctionUrl(), cronPushBearer());
    const events = await runEventRecapsReady(admin, pushFunctionUrl(), cronPushBearer());
    const shared = await runSharedDropsReleased(admin, pushFunctionUrl(), cronPushBearer());
    return NextResponse.json({ ok: true, chat, events, shared });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/drops]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
