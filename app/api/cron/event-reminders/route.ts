import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest, cronPushBearer } from '@/lib/server/cronAuth';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { runEventReminders } from '@/lib/cron/eventReminders';
import { runEventTeaserPushes } from '@/lib/cron/eventTeasers';


const pushFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-notification`
  : null;

/**
 * Optional HTTP entry point for event reminder pushes.
 * Production scheduling uses Supabase pg_cron → cron-hourly-maintenance (not Vercel crons).
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
    const result = await runEventReminders(admin, pushFunctionUrl, cronPushBearer() ?? '');
    const teasers = await runEventTeaserPushes(admin, pushFunctionUrl, cronPushBearer() ?? '');
    return NextResponse.json({ ok: true, ...result, teasers });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/event-reminders]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
