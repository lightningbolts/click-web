import 'server-only';
import { getStripe } from '@/lib/server/stripe';
import { reconcileSession, TicketingAttentionError } from './reconcile';

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadOrder } from '@/lib/server/ticketing/fulfillment';
import { snapshotFromStripeAccount } from '@/lib/server/ticketing/connect';
import { accountRowPatch } from '@/lib/server/ticketing/accountState';
import { syncRefundedFees } from './refundFees';

/**
 * Ticketing slice of the Stripe webhook. Deliberately constrained event set;
 * every handler converges local state from the current Stripe object rather
 * than assuming delivery order, and every business mutation is idempotent
 * (order-state guards + unique Stripe ids inside the RPCs).
 */

export const TICKETING_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'refund.updated',
  'charge.dispute.created',
  'account.updated',
] as const;

export function isTicketingEvent(event: Stripe.Event): boolean {
  if (event.type === 'account.updated') return true;
  if (event.type.startsWith('checkout.session.')) {
    const session = event.data.object as Stripe.Checkout.Session;
    return Boolean(session.metadata?.click_order_id);
  }
  if (event.type === 'refund.updated') {
    // Refunds created through Click carry order metadata; Dashboard-created
    // refunds are caught by the periodic reconciliation pass instead.
    const object = event.data.object as { metadata?: Record<string, string> };
    return Boolean(object.metadata?.click_order_id);
  }
  if (event.type === 'charge.dispute.created') return true;
  return false;
}

/** Throws on transient failure so the webhook returns 5xx and Stripe retries. */
export async function handleTicketingEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<'processed' | 'ignored'> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      return reconcileSession(admin, (event.data.object as Stripe.Checkout.Session).id);

    case 'refund.updated': {
      const refund = await getStripe().refunds.retrieve((event.data.object as Stripe.Refund).id);
      await applyRefundObject(admin, refund);
      return 'processed';
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
      if (!chargeId) return 'ignored';
      const { data, error } = await admin
        .from('ticket_orders')
        .select('id')
        .eq('stripe_charge_id', chargeId)
        .maybeSingle();
      if (error) throw new Error(`dispute order lookup failed: ${error.message}`);
      const orderId = (data as { id: string } | null)?.id;
      if (!orderId) return 'ignored'; // not a ticket charge
      const { error: rpcError } = await admin.rpc('ticketing_mark_disputed', { p_order: orderId });
      if (rpcError) throw new Error(`ticketing_mark_disputed failed: ${rpcError.message}`);
      throw new TicketingAttentionError(`Ticket order ${orderId} disputed (${dispute.id})`);
    }

    case 'account.updated': {
      const account = await getStripe().accounts.retrieve((event.data.object as Stripe.Account).id);
      const { data, error } = await admin
        .from('organizer_payment_accounts')
        .update(accountRowPatch(snapshotFromStripeAccount(account)))
        .eq('stripe_account_id', account.id)
        .select('id');
      if (error) throw new Error(`account.updated sync failed: ${error.message}`);
      if ((data ?? []).length === 0) return 'ignored'; // not an organizer account (e.g. platform)
      return 'processed';
    }

    default:
      return 'ignored';
  }
}

export async function applyRefundObject(
  admin: SupabaseClient,
  refund: Stripe.Refund,
): Promise<void> {
  const orderId = refund.metadata?.click_order_id;
  if (!orderId) return;
  if(!refund.metadata?.click_refund_request_id)throw new TicketingAttentionError('refund_request_reference_missing');
  const order = await loadOrder(admin, orderId);
  if (!order) {
    throw new TicketingAttentionError('refund_order_not_found');
  }
  const status =
    refund.status === 'succeeded'
      ? 'succeeded'
      : refund.status === 'failed'
        ? 'failed'
        : refund.status === 'canceled'
          ? 'canceled'
          : 'pending';
  const { data: claim, error: claimError } = await admin
    .from('ticket_refunds')
    .select('ticket_ids,order_id,amount')
    .eq('id', refund.metadata?.click_refund_request_id ?? '')
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  const intent =
    typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
  if (
    !claim ||
    claim.order_id !== orderId ||
    claim.amount !== refund.amount ||
    intent !== order.stripe_payment_intent_id
  )
    throw new TicketingAttentionError('refund_mismatch');
  const ticketIds = claim.ticket_ids;
  const { data, error } = await admin.rpc('ticketing_apply_refund', {
    p_order: orderId,
    p_request: refund.metadata?.click_refund_request_id,
    p_stripe_refund: refund.id,
    p_amount: refund.amount,
    p_status: status,
    p_ticket_ids: ticketIds,
  });
  if (error) throw new Error(`ticketing_apply_refund failed: ${error.message}`);
  const result = data as { ok: boolean; code?: string };
  if (!result.ok) {
    throw new TicketingAttentionError(result.code);
  }
  if (status === 'succeeded') await syncRefundedFees(admin, orderId);
}
