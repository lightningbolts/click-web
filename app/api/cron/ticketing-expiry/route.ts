import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireTicketingEnabled } from '@/lib/server/ticketing/flags';
import { recoverReservation, recoverRefund } from '@/lib/server/ticketing/recovery';
export async function GET(request: NextRequest) {
  const gate = requireTicketingEnabled();
  if (gate) return gate;
  if (
    !process.env.CRON_SECRET ||
    request.headers.get('authorization') !== 'Bearer ' + process.env.CRON_SECRET
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('ticket_orders')
    .select('id,stripe_checkout_session_id,created_at,checkout_expires_at,checkout_request')
    .in('order_state', ['reserved', 'checkout_created', 'payment_processing'])
    .lt('checkout_expires_at', new Date().toISOString())
    .order('updated_at')
    .limit(100);
  if (error) return NextResponse.json({ error: 'Reconciliation unavailable' }, { status: 500 });
  let reconciled = 0,
    needsAttention = 0;
  for (const order of data ?? []) {
    let attention: string | null = null;
    try {
      await recoverReservation(admin, order);
      reconciled++;
    } catch (error) {
      needsAttention++;
      attention = error instanceof Error ? error.message : 'reconciliation_failed';
    }
    await admin
      .from('ticket_orders')
      .update({ reconciliation_error: attention, updated_at: new Date().toISOString() })
      .eq('id', order.id);
  }
  const { data: claims, error: claimError } = await admin
    .from('ticket_refunds')
    .select('id,order_id,stripe_refund_id')
    .or('status.eq.pending,completed_at.gte.' + new Date(Date.now() - 86400000).toISOString())
    .order('last_reconciled_at', { nullsFirst: true })
    .limit(100);
  if (claimError)
    return NextResponse.json({ error: 'Refund reconciliation unavailable' }, { status: 500 });
  for (const claim of claims ?? []) {
    let attention: string | null = null;
    try {
      await recoverRefund(admin, claim);
      reconciled++;
    } catch (error) {
      needsAttention++;
      attention = error instanceof Error ? error.message : 'reconciliation_failed';
    }
    await admin
      .from('ticket_refunds')
      .update({ reconciliation_error: attention, last_reconciled_at: new Date().toISOString() })
      .eq('id', claim.id);
  }
  return NextResponse.json({ reconciled, needs_attention: needsAttention });
}
