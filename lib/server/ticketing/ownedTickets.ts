import type { SupabaseClient } from '@supabase/supabase-js';
import { eventPassKey, issueTicketCredential } from '@/lib/server/eventPass';
import {
  eventEndAtFromMetadata,
  eventImageFromMetadata,
  eventInstantFromRowOrMeta,
  eventLocationNameFromMetadata,
  eventStartAtFromMetadata,
  eventTimezoneFromMetadata,
  eventTitleFromMetadata,
  parseBeaconMetadata,
} from '@/lib/events/eventMetadata';
import { coverVisualSeed } from '@/lib/events/eventOptions';
import type { MyTicketsGroup, OrderSummary, OwnedTicket, TicketEventRef, TicketStatus } from '@/lib/ticketing/types';

/** An event without an end time counts as upcoming until this long after it starts. */
const OPEN_ENDED_EVENT_MS = 6 * 60 * 60 * 1000;

const TICKET_SELECT =
  'id, beacon_id, order_id, status, ticket_number, issued_at, checked_in_at, ticket_tiers ( name ), ' +
  'map_beacons ( id, metadata, starts_at, ends_at, event_timezone, cover_theme_id, event_cancelled_at )';

type Embedded<T> = T | T[] | null;

type EventEmbed = {
  id: string;
  metadata: unknown;
  starts_at: string | null;
  ends_at: string | null;
  event_timezone: string | null;
  cover_theme_id: string | null;
  event_cancelled_at: string | null;
};

type TicketRow = {
  id: string;
  beacon_id: string;
  order_id: string;
  status: TicketStatus;
  ticket_number: string;
  issued_at: string;
  checked_in_at: string | null;
  ticket_tiers: Embedded<{ name: string }>;
  map_beacons: Embedded<EventEmbed>;
};

function one<T>(embedded: Embedded<T>): T | null {
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

function toOwnedTicket(row: TicketRow, key: Buffer | null): OwnedTicket {
  const admits = row.status === 'valid' || row.status === 'checked_in';
  const credential = key && admits ? issueTicketCredential(key, row.beacon_id, row.id) : null;
  return {
    id: row.id,
    beacon_id: row.beacon_id,
    order_id: row.order_id,
    status: row.status,
    tier_name: one(row.ticket_tiers)?.name ?? 'Ticket',
    ticket_number: row.ticket_number,
    issued_at: row.issued_at,
    checked_in_at: row.checked_in_at,
    credential_url: credential?.url ?? null,
    code: credential?.code ?? null,
  };
}

function toEventRef(row: TicketRow): TicketEventRef {
  const event = one(row.map_beacons);
  const meta = parseBeaconMetadata(event?.metadata);
  return {
    beacon_id: row.beacon_id,
    title: eventTitleFromMetadata(meta) ?? 'Event',
    start_at: eventInstantFromRowOrMeta(event?.starts_at, eventStartAtFromMetadata(meta)),
    end_at: eventInstantFromRowOrMeta(event?.ends_at, eventEndAtFromMetadata(meta)),
    timezone: event?.event_timezone?.trim() || eventTimezoneFromMetadata(meta),
    location_name: eventLocationNameFromMetadata(meta),
    image_url: eventImageFromMetadata(meta),
    visual_seed: coverVisualSeed(row.beacon_id, event?.cover_theme_id),
    cancelled: Boolean(event?.event_cancelled_at),
  };
}

async function loadTicketRows(
  admin: SupabaseClient,
  userId: string,
  opts: { beaconId?: string; ticketId?: string },
): Promise<TicketRow[]> {
  let query = admin.from('tickets').select(TICKET_SELECT).eq('owner_user_id', userId);
  if (opts.beaconId) query = query.eq('beacon_id', opts.beaconId);
  if (opts.ticketId) query = query.eq('id', opts.ticketId);
  const { data, error } = await query.order('issued_at', { ascending: true });
  if (error) throw new Error(`tickets load failed: ${error.message}`);
  return (data ?? []) as unknown as TicketRow[];
}

/**
 * The user's tickets with their credentials. Credentials derive from the ticket id,
 * so every read (and every device) shows the same code; nothing is written.
 */
export async function listOwnedTickets(
  admin: SupabaseClient,
  userId: string,
  opts: { beaconId?: string; ticketId?: string } = {},
): Promise<OwnedTicket[]> {
  const key = eventPassKey();
  return (await loadTicketRows(admin, userId, opts)).map((row) => toOwnedTicket(row, key));
}

function eventEndsMs(event: TicketEventRef): number | null {
  if (event.end_at) return Date.parse(event.end_at);
  if (event.start_at) return Date.parse(event.start_at) + OPEN_ENDED_EVENT_MS;
  return null;
}

/** The ticket wallet: one group per event. Upcoming soonest first; past latest first. */
export async function listTicketGroups(
  admin: SupabaseClient,
  userId: string,
  scope: 'upcoming' | 'past',
  nowMs: number,
): Promise<MyTicketsGroup[]> {
  const key = eventPassKey();
  const groups = new Map<string, MyTicketsGroup>();
  for (const row of await loadTicketRows(admin, userId, {})) {
    let group = groups.get(row.beacon_id);
    if (!group) {
      group = { event: toEventRef(row), tickets: [] };
      groups.set(row.beacon_id, group);
    }
    group.tickets.push(toOwnedTicket(row, key));
  }

  // An event with no date stays in Upcoming so its tickets are never hidden.
  const isPast = (group: MyTicketsGroup) => {
    const ends = eventEndsMs(group.event);
    return ends != null && ends < nowMs;
  };
  const startMs = (group: MyTicketsGroup) =>
    group.event.start_at ? Date.parse(group.event.start_at) : Number.POSITIVE_INFINITY;

  return [...groups.values()]
    .filter((group) => isPast(group) === (scope === 'past'))
    .sort((a, b) => (scope === 'upcoming' ? startMs(a) - startMs(b) : startMs(b) - startMs(a)));
}

type OrderRow = {
  id: string;
  currency: string;
  subtotal_amount: number;
  total_amount: number;
  paid_at: string | null;
  ticket_order_items: { tier_name_snapshot: string; quantity: number; unit_amount: number }[] | null;
  ticket_refunds: { amount: number; status: string }[] | null;
};

async function loadOrderSummary(admin: SupabaseClient, orderId: string): Promise<OrderSummary | null> {
  const { data, error } = await admin
    .from('ticket_orders')
    .select(
      'id, currency, subtotal_amount, total_amount, paid_at, ' +
        'ticket_order_items ( tier_name_snapshot, quantity, unit_amount ), ticket_refunds ( amount, status )',
    )
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(`order load failed: ${error.message}`);
  const order = data as unknown as OrderRow | null;
  if (!order) return null;
  return {
    id: order.id,
    items: (order.ticket_order_items ?? []).map((item) => ({
      tier_name: item.tier_name_snapshot,
      quantity: item.quantity,
      unit_amount: item.unit_amount,
    })),
    subtotal_amount: order.subtotal_amount,
    platform_fee_amount: 0,
    total_amount: order.total_amount,
    currency: order.currency,
    paid_at: order.paid_at,
    refunded_amount: (order.ticket_refunds ?? [])
      .filter((refund) => refund.status === 'succeeded')
      .reduce((sum, refund) => sum + refund.amount, 0),
  };
}

/** One of the user's tickets with its event and receipt, or null when it isn't theirs. */
export async function loadOwnedTicket(
  admin: SupabaseClient,
  userId: string,
  ticketId: string,
): Promise<{ ticket: OwnedTicket; event: TicketEventRef; order: OrderSummary } | null> {
  const [row] = await loadTicketRows(admin, userId, { ticketId });
  if (!row) return null;
  const order = await loadOrderSummary(admin, row.order_id);
  if (!order) return null;
  return { ticket: toOwnedTicket(row, eventPassKey()), event: toEventRef(row), order };
}
