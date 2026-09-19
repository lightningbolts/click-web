import 'server-only';

import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fulfillFromCheckoutSession, loadOrder } from '@/lib/server/ticketing/fulfillment';
import { snapshotFromStripeAccount } from '@/lib/server/ticketing/connect';
import { accountRowPatch } from '@/lib/server/ticketing/accountState';

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
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      const result = await fulfillFromCheckoutSession(admin, session);
      if (!result.ok && result.code !== 'not_paid_yet') {
        // Reconciliation mismatches are operator-visible, not retried forever.
        console.error(
          `Ticketing fulfillment rejected (order=${session.metadata?.click_order_id}, session=${session.id}): ${result.code}`,
        );
      }
      return;
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.click_order_id ?? session.client_reference_id;
      if (!orderId) return;
      const { error } = await admin.rpc('ticketing_cancel_order', {
        p_order: orderId,
        p_target_state: 'expired',
      });
      if (error) throw new Error(`ticketing_cancel_order failed: ${error.message}`);
      return;
    }

    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.click_order_id ?? session.client_reference_id;
      if (!orderId) return;
      const { error } = await admin.rpc('ticketing_cancel_order', {
        p_order: orderId,
        p_target_state: 'payment_failed',
      });
      if (error) throw new Error(`ticketing_cancel_order failed: ${error.message}`);
      return;
    }

    case 'refund.updated': {
      const refund = event.data.object as Stripe.Refund;
      await applyRefundObject(admin, refund);
      return;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
      if (!chargeId) return;
      const { data, error } = await admin
        .from('ticket_orders')
        .select('id')
        .eq('stripe_charge_id', chargeId)
        .maybeSingle();
      if (error) throw new Error(`dispute order lookup failed: ${error.message}`);
      const orderId = (data as { id: string } | null)?.id;
      if (!orderId) return; // not a ticket charge
      const { error: rpcError } = await admin.rpc('ticketing_mark_disputed', { p_order: orderId });
      if (rpcError) throw new Error(`ticketing_mark_disputed failed: ${rpcError.message}`);
      console.error(`Ticket order ${orderId} disputed (${dispute.id}); operator action required.`);
      return;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      const { data, error } = await admin
        .from('organizer_payment_accounts')
        .update(accountRowPatch(snapshotFromStripeAccount(account)))
        .eq('stripe_account_id', account.id)
        .select('id');
      if (error) throw new Error(`account.updated sync failed: ${error.message}`);
      if ((data ?? []).length === 0) return; // not an organizer account (e.g. platform)
      return;
    }

    default:
      return;
  }
}

async function applyRefundObject(admin: SupabaseClient, refund: Stripe.Refund): Promise<void> {
  const orderId = refund.metadata?.click_order_id;
  if (!orderId) return;
  const order = await loadOrder(admin, orderId);
  if (!order) {
    console.error(`refund ${refund.id} references unknown order ${orderId}`);
    return;
  }
  const status =
    refund.status === 'succeeded'
      ? 'succeeded'
      : refund.status === 'failed'
        ? 'failed'
        : refund.status === 'canceled'
          ? 'canceled'
          : 'pending';
  const ticketIds = (refund.metadata?.click_ticket_ids ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const { data, error } = await admin.rpc('ticketing_apply_refund', {
    p_order: orderId,
    p_stripe_refund: refund.id,
    p_amount: refund.amount,
    p_status: status,
    p_ticket_ids: ticketIds,
  });
  if (error) throw new Error(`ticketing_apply_refund failed: ${error.message}`);
  const result = data as { ok: boolean; code?: string };
  if (!result.ok) {
    console.error(`refund ${refund.id} not applied to order ${orderId}: ${result.code}`);
  }
}
