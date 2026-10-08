import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/server/cronAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { retryCancelledEventRefunds } from '@/lib/server/ticketing/cancelEvent';


/**
 * Ticketing reservation sweep: expires orders whose Checkout Session lapsed
 * and releases their inventory holds. The checkout.session.expired webhook
 * usually does this sooner; the sweep is the safety net against missed
 * deliveries and orders that never reached Stripe. It also retries refunds
 * for cancelled events whose paid orders aren't fully refunded yet.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc('ticketing_expire_stale');
  if (error) {
    console.error('[cron/ticketing-expiry]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let refundsRetried = 0;
  try {
    refundsRetried = await retryCancelledEventRefunds(admin);
  } catch (e) {
    console.error('[cron/ticketing-expiry] refund retry:', e);
  }

  return NextResponse.json({ ok: true, expired: data ?? 0, refunds_retried: refundsRetried });
}
