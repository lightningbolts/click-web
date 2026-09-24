export type TicketTier = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  unit_amount: number;
  remaining: number;
  max_per_order: number;
  max_per_user: number | null;
  sales_start_at: string | null;
  sales_end_at: string | null;
  is_active: boolean;
  capacity?: number;
  sold?: number;
  held?: number;
  sort_order: number;
};
export type TicketingEvent = {
  admission_type: string;
  ticketing_status: string;
  ticket_sales_start_at: string | null;
  ticket_sales_end_at: string | null;
};
export type TierResponse = { tiers: TicketTier[]; event: TicketingEvent; can_refund: boolean };
export type Ticket = {
  event_name?: string;
  id: string;
  ticket_number: string;
  tier_name: string | null;
  status: string;
  checked_in_at: string | null;
};
export type TicketOrder = {
  id: string;
  beacon_id?: string;
  currency: string;
  total_amount: number;
  order_state: string;
  fulfillment_state: string;
  buyer?: { name: string; avatar_url: string | null };
  ticket_refunds?: { id: string; amount: number; status: string; ticket_ids: string[] }[];
  ticket_order_items?: {
    ticket_tier_id: string;
    tier_name_snapshot: string;
    quantity: number;
    unit_amount: number;
  }[];
  tickets?: { id: string; ticket_tier_id: string; ticket_number: string; status: string }[];
};
