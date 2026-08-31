import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { runEventReminders } from '@/lib/cron/eventReminders';
import { runEventTeaserPushes } from '@/lib/cron/eventTeasers';

const CRON_SECRET = process.env.CRON_SECRET;

const pushFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-notification`
  : null;

/**
 * Optional HTTP entry point for event reminder pushes.
 * Production scheduling uses Supabase pg_cron → cron-hourly-maintenance (not Vercel crons).
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
    const result = await runEventReminders(admin, pushFunctionUrl, CRON_SECRET);
    const teasers = await runEventTeaserPushes(admin, pushFunctionUrl, CRON_SECRET);
    return NextResponse.json({ ok: true, ...result, teasers });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cron/event-reminders]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
