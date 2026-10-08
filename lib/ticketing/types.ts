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
