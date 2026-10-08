/** Ticketing shapes shared by API routes and client UI. Money is integer cents. */

export type TicketingStatus = 'draft' | 'ready' | 'sales_open' | 'sales_paused' | 'sales_closed';

export type TierAvailability = 'on_sale' | 'sold_out' | 'not_started' | 'ended' | 'paused';

export type TicketOffering = {
  id: string;
  name: string;
  description: string | null;
  unit_amount: number;
  currency: string;
  availability: TierAvailability;
  /** Only when 10 or fewer are left, so buyers see scarcity without exposing sales figures. */
  remaining: number | null;
  /** Most the viewer can select now: order limit, stock and per-person limit combined. */
  max_quantity: number;
  /** When sales open for this tier (the later of the event's and the tier's start). */
  sales_start_at: string | null;
  sales_end_at: string | null;
};

export type ManagedTier = TicketOffering & {
  capacity: number;
  sold: number;
  held: number;
  checked_in: number;
  is_active: boolean;
  max_per_order: number;
  max_per_user: number | null;
  sort_order: number;
};

export type EventTicketing = {
  status: TicketingStatus;
  cancelled: boolean;
  from_amount: number | null;
  currency: string;
  available: boolean;
};

export type TicketStatus = 'valid' | 'checked_in' | 'refunded' | 'void';

/** A ticket as its owner sees it. The credential is present only while the ticket admits. */
export type OwnedTicket = {
  id: string;
  beacon_id: string;
  order_id: string;
  status: TicketStatus;
  tier_name: string;
  ticket_number: string;
  issued_at: string;
  checked_in_at: string | null;
  credential_url: string | null;
  code: string | null;
};

export type TicketEventRef = {
  beacon_id: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  timezone: string | null;
  location_name: string | null;
  image_url: string | null;
  visual_seed: string;
  cancelled: boolean;
};

export type MyTicketsGroup = { event: TicketEventRef; tickets: OwnedTicket[] };

/** The buyer's receipt. The organizer absorbs Click's fee, so buyers always see a fee of 0. */
export type OrderSummary = {
  id: string;
  items: { tier_name: string; quantity: number; unit_amount: number }[];
  subtotal_amount: number;
  platform_fee_amount: 0;
  total_amount: number;
  currency: string;
  paid_at: string | null;
  refunded_amount: number;
};

export type TicketSalesSummary = {
  sold: number;
  capacity: number;
  checked_in: number;
  gross_cents: number;
  refunded_cents: number;
  /** What the organizer receives: gross less refunds and the part of Click's fee it keeps. */
  net_cents: number;
  /** Paid orders with money left to refund: what cancelling the event would refund. */
  refundable_orders: number;
  currency: string;
  tiers: { id: string; name: string; sold: number; capacity: number; unit_amount: number }[];
};

export type TicketAttendee = {
  ticket_id: string;
  order_id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  tier_name: string;
  status: TicketStatus;
  checked_in_at: string | null;
  ticket_number: string;
  /** What this ticket cost, in minor units (its price when bought). */
  amount: number;
  currency: string;
  /** Paid tickets that still admit, and only for people who manage the event. */
  refundable: boolean;
};
