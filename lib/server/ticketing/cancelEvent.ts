import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripe } from '@/lib/server/stripe';
import { requestTicketRefund } from '@/lib/server/ticketing/refunds';
import type { OrderRow } from '@/lib/server/ticketing/fulfillment';

/** Refunds started per request; the cron picks up the rest. */
const REFUNDS_PER_RUN = 100;
/** How long after a cancellation the cron keeps retrying failed refunds. */
const RETRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const REFUND_REASON = 'event_cancelled';
/** Refusals meaning the refund already happened (a repeat cancel or cron pass). */
const ALREADY_REFUNDED = new Set(['no_refundable_tickets', 'order_not_refundable']);

type RefundTally = { refunds_started: number; refunds_failed: number };

async function refundOrders(admin: SupabaseClient, orderIds: readonly string[], requestedBy: (order: OrderRow) => string) {
  const tally: RefundTally = { refunds_started: 0, refunds_failed: 0 };
  const ids = orderIds.slice(0, REFUNDS_PER_RUN);
  if (ids.length === 0) return tally;

  const { data, error } = await admin.from('ticket_orders').select('*').in('id', ids);
  if (error) throw new Error(`ticket_orders load failed: ${error.message}`);
  const byId = new Map(((data ?? []) as OrderRow[]).map((order) => [order.id, order]));

  // Sequential: Stripe rate limits, and each refund is idempotent on its ticket set.
  for (const id of ids) {
    const order = byId.get(id);
    if (!order) continue;
    try {
      const result = await requestTicketRefund(admin, order, requestedBy(order), null, REFUND_REASON);
      if (result.ok) tally.refunds_started += 1;
      else if (!ALREADY_REFUNDED.has(result.code)) {
        console.error(`cancel refund refused (order=${id}): ${result.code}`);
        tally.refunds_failed += 1;
      }
    } catch (e) {
      console.error(`cancel refund failed (order=${id}):`, e);
      tally.refunds_failed += 1;
    }
  }
  return tally;
}

/**
 * Cancels an event: the database closes sales, releases holds and voids free tickets in one
 * transaction; then every paid order is refunded in full. Open Stripe Checkout pages are expired
 * so nobody pays for a ticket that no longer exists. Safe to repeat.
 */
export async function cancelTicketedEvent(
  admin: SupabaseClient,
  beaconId: string,
  actorUserId: string,
): Promise<RefundTally> {
  const { data: open, error: openError } = await admin
    .from('ticket_orders')
    .select('stripe_checkout_session_id')
    .eq('beacon_id', beaconId)
    .in('order_state', ['reserved', 'checkout_created'])
    .not('stripe_checkout_session_id', 'is', null);
  if (openError) throw new Error(`open orders load failed: ${openError.message}`);

  const { data, error } = await admin.rpc('ticketing_cancel_event', { p_beacon: beaconId });
  if (error) throw new Error(`ticketing_cancel_event failed: ${error.message}`);
  const cancelled = data as { ok: boolean; code?: string; refund_order_ids?: string[] };
  if (!cancelled.ok) throw new Error(`ticketing_cancel_event refused: ${cancelled.code}`);

  const stripe = getStripe();
  await Promise.all(
    ((open ?? []) as { stripe_checkout_session_id: string }[]).map(({ stripe_checkout_session_id: session }) =>
      // A session that already completed or expired can't be expired; a late payment is refunded by the webhook.
      stripe.checkout.sessions.expire(session).catch((e: unknown) => {
        console.warn(`checkout session ${session} not expired:`, e instanceof Error ? e.message : e);
      }),
    ),
  );

  return refundOrders(admin, cancelled.refund_order_ids ?? [], () => actorUserId);
}

/** Cron: retries refunds for recently cancelled events whose paid orders aren't fully refunded. */
export async function retryCancelledEventRefunds(admin: SupabaseClient, nowMs = Date.now()): Promise<number> {
  const { data: events, error: eventsError } = await admin
    .from('map_beacons')
    .select('id, creator_id')
    .not('event_cancelled_at', 'is', null)
    .gte('event_cancelled_at', new Date(nowMs - RETRY_WINDOW_MS).toISOString());
  if (eventsError) throw new Error(`cancelled events load failed: ${eventsError.message}`);
  const creators = new Map(((events ?? []) as { id: string; creator_id: string }[]).map((e) => [e.id, e.creator_id]));
  if (creators.size === 0) return 0;

  const { data: orders, error: ordersError } = await admin
    .from('ticket_orders')
    .select('id')
    .in('beacon_id', [...creators.keys()])
    .in('order_state', ['paid', 'partially_refunded'])
    .gt('total_amount', 0)
    .limit(REFUNDS_PER_RUN);
  if (ordersError) throw new Error(`refund retry load failed: ${ordersError.message}`);

  const tally = await refundOrders(
    admin,
    ((orders ?? []) as { id: string }[]).map((o) => o.id),
    (order) => creators.get(order.beacon_id)!,
  );
  return tally.refunds_started;
}
