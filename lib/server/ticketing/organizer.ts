import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventAccess } from '@/lib/events/beaconManageAuth';
import { loadManagedTiers } from '@/lib/server/ticketing/offerings';
import type { TicketAttendee, TicketSalesSummary, TicketStatus } from '@/lib/ticketing/types';

export const ATTENDEE_PAGE_SIZE = 50;

/** Orders whose money moved: refunds and disputes still count toward gross. */
const SETTLED_ORDER_STATES = ['paid', 'partially_refunded', 'refunded', 'disputed'];

type SettledOrder = {
  currency: string;
  total_amount: number;
  platform_fee_amount: number;
  ticket_refunds: { amount: number; status: string }[] | null;
};

/**
 * Sales totals for the organizer dashboard. Stripe refunds Click's fee in proportion
 * to each refund, so net subtracts only the share of the fee on money that was kept.
 */
export async function loadSalesSummary(admin: SupabaseClient, beaconId: string): Promise<TicketSalesSummary> {
  const [tiers, ordersResult] = await Promise.all([
    loadManagedTiers(admin, beaconId, Date.now()),
    admin
      .from('ticket_orders')
      .select('currency, total_amount, platform_fee_amount, ticket_refunds ( amount, status )')
      .eq('beacon_id', beaconId)
      .in('order_state', SETTLED_ORDER_STATES),
  ]);
  if (ordersResult.error) throw new Error(`sales summary load failed: ${ordersResult.error.message}`);
  const orders = (ordersResult.data ?? []) as unknown as SettledOrder[];

  let gross = 0;
  let refunded = 0;
  let feeKept = 0;
  let refundableOrders = 0;
  for (const order of orders) {
    const orderRefunded = (order.ticket_refunds ?? [])
      .filter((refund) => refund.status === 'succeeded')
      .reduce((sum, refund) => sum + refund.amount, 0);
    gross += order.total_amount;
    refunded += orderRefunded;
    if (order.total_amount > orderRefunded) refundableOrders += 1;
    if (order.total_amount > 0) {
      feeKept += Math.round(order.platform_fee_amount * (1 - orderRefunded / order.total_amount));
    }
  }

  return {
    sold: tiers.reduce((sum, tier) => sum + tier.sold, 0),
    capacity: tiers.reduce((sum, tier) => sum + tier.capacity, 0),
    checked_in: tiers.reduce((sum, tier) => sum + tier.checked_in, 0),
    gross_cents: gross,
    refunded_cents: refunded,
    net_cents: gross - refunded - feeKept,
    refundable_orders: refundableOrders,
    currency: orders[0]?.currency ?? tiers[0]?.currency ?? 'usd',
    tiers: tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      sold: tier.sold,
      capacity: tier.capacity,
      unit_amount: tier.unit_amount,
    })),
  };
}

type AttendeeRow = {
  ticket_id: string;
  order_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  tier_name: string;
  unit_amount: number;
  currency: string;
  status: TicketStatus;
  checked_in_at: string | null;
  ticket_number: string;
  issued_at: string;
};

type Cursor = { issuedAt: string; id: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodeCursor(row: AttendeeRow): string {
  return Buffer.from(JSON.stringify([row.issued_at, row.ticket_id])).toString('base64url');
}

/** The cursor, null for the first page, or 'invalid' for anything we didn't issue. */
export function decodeAttendeeCursor(raw: string | null): Cursor | null | 'invalid' {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === 'string' &&
      Number.isFinite(Date.parse(parsed[0])) &&
      typeof parsed[1] === 'string' &&
      UUID_RE.test(parsed[1])
    ) {
      return { issuedAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  return 'invalid';
}

function holderName(row: AttendeeRow): string {
  const full = [row.first_name, row.last_name].map((part) => part?.trim()).filter(Boolean).join(' ');
  return full || row.display_name?.trim() || 'Guest';
}

/** One page of ticket holders, matched by name or ticket number (see ticketing_search_attendees). */
export async function searchAttendees(
  admin: SupabaseClient,
  beaconId: string,
  query: string,
  cursor: Cursor | null,
  access: EventAccess,
): Promise<{ attendees: TicketAttendee[]; next_cursor: string | null }> {
  const { data, error } = await admin.rpc('ticketing_search_attendees', {
    p_beacon: beaconId,
    p_query: query.trim(),
    p_after_issued_at: cursor?.issuedAt ?? null,
    p_after_id: cursor?.id ?? null,
    p_limit: ATTENDEE_PAGE_SIZE + 1,
  });
  if (error) throw new Error(`ticketing_search_attendees failed: ${error.message}`);

  const rows = (data ?? []) as AttendeeRow[];
  const page = rows.slice(0, ATTENDEE_PAGE_SIZE);
  const hasMore = rows.length > ATTENDEE_PAGE_SIZE;
  return {
    attendees: page.map((row) => ({
      ticket_id: row.ticket_id,
      order_id: row.order_id,
      user_id: row.user_id,
      name: holderName(row),
      avatar_url: row.avatar_url,
      tier_name: row.tier_name,
      status: row.status,
      checked_in_at: row.checked_in_at,
      ticket_number: row.ticket_number,
      amount: row.unit_amount,
      currency: row.currency,
      refundable: access === 'manage' && row.unit_amount > 0 && (row.status === 'valid' || row.status === 'checked_in'),
    })),
    next_cursor: hasMore ? encodeCursor(page[page.length - 1]!) : null,
  };
}
