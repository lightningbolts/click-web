import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/server/stripe';

/** Stripe owns rounding of proportional application-fee refunds. Never estimate it in the UI. */
export async function syncRefundedFees(admin: SupabaseClient, orderId: string) {
  const { data: order, error } = await admin
    .from('ticket_orders')
    .select('stripe_charge_id,platform_fee_amount')
    .eq('id', orderId)
    .single();
  if (error) throw new Error(error.message);
  if (!order.stripe_charge_id || !order.platform_fee_amount) return;
  const charge = await getStripe().charges.retrieve(order.stripe_charge_id, {
    expand: ['application_fee'],
  });
  const fee = charge.application_fee;
  if (!fee || typeof fee === 'string')
    throw new Error('Application fee reconciliation unavailable');
  const { error: recordError } = await admin.rpc('ticketing_record_fee_refunds', {
    p_order: orderId,
    p_charge: charge.id,
    p_amount: fee.amount_refunded,
  });
  if (recordError) throw new Error(recordError.message);
}
