import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Ticketing reservation sweep: expires orders whose Checkout Session lapsed
 * and releases their inventory holds. The checkout.session.expired webhook
 * usually does this sooner; the sweep is the safety net against missed
 * deliveries and orders that never reached Stripe.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc('ticketing_expire_stale');
  if (error) {
    console.error('[cron/ticketing-expiry]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expired: data ?? 0 });
}
