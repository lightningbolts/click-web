import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import type {
  ManagedTier,
  MyTicketsGroup,
  OrderSummary,
  OwnedTicket,
  TicketAttendee,
  TicketEventRef,
  TicketOffering,
  TicketSalesSummary,
  TicketingStatus,
} from '@/lib/ticketing/types';

/** A refused or failed ticketing request. `status` 0 means the request never reached Click. */
export class TicketingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly remaining?: number,
    /** The server's own sentence, shown when the code has no local copy. */
    readonly serverMessage?: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(serverMessage ?? code ?? `HTTP ${status}`);
    this.name = 'TicketingError';
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...((await getFreshAuthHeaders()) as Record<string, string>) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new TicketingError(0, 'network');
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const { error, code, remaining, ...details } = data;
    throw new TicketingError(
      response.status,
      typeof code === 'string' ? code : null,
      typeof remaining === 'number' ? remaining : undefined,
      typeof error === 'string' ? error : undefined,
      details,
    );
  }
  return data as T;
}

// Buyers ---------------------------------------------------------------------

export function offeringsUrl(beaconId: string): string {
  return `/api/beacons/${beaconId}/tickets/tiers`;
}

export async function fetchOfferings(url: string): Promise<TicketOffering[]> {
  return (await request<{ tiers: TicketOffering[] }>('GET', url)).tiers;
}

export type CheckoutLine = { ticket_tier_id: string; quantity: number };
export type CheckoutStart = { order_id: string; checkout_url?: string; status?: 'fulfilled' };

/** Free orders come back `fulfilled`; paid orders return Stripe's hosted page to open. */
export function startCheckout(beaconId: string, items: CheckoutLine[]): Promise<CheckoutStart> {
  return request('POST', `/api/beacons/${beaconId}/tickets/checkout`, { items, client: 'web' });
}

export type OrderProjection = {
  id: string;
  beacon_id: string;
  order_state: string;
  fulfillment_state: string;
  total_amount: number;
  ticket_count: number;
};

export async function fetchOrder(orderId: string): Promise<OrderProjection> {
  return (await request<{ order: OrderProjection }>('GET', `/api/orders/${orderId}`)).order;
}

export type OrderOutcome = 'confirmed' | 'pending' | 'canceled' | 'failed' | 'expired' | 'refunded';

/** What the buyer sees after checkout. Webhooks, not the return redirect, decide this. */
export function orderOutcome(order: OrderProjection): OrderOutcome {
  switch (order.order_state) {
    case 'paid':
    case 'partially_refunded':
    case 'disputed':
      return order.fulfillment_state === 'fulfilled' ? 'confirmed' : 'pending';
    case 'refunded':
      return 'refunded';
    case 'canceled':
      return 'canceled';
    case 'payment_failed':
      return 'failed';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

export async function fetchEventTickets(beaconId: string): Promise<OwnedTicket[]> {
  return (await request<{ tickets: OwnedTicket[] }>('GET', `/api/beacons/${beaconId}/tickets`)).tickets;
}

export type TicketDetail = { ticket: OwnedTicket; event: TicketEventRef; order: OrderSummary };

/** `GET /api/tickets/:id`: one of your tickets with its event and receipt. */
export async function fetchTicketDetail(ticketId: string): Promise<TicketDetail> {
  return request<TicketDetail>('GET', `/api/tickets/${ticketId}`);
}

export async function fetchMyTickets(scope: 'upcoming' | 'past'): Promise<MyTicketsGroup[]> {
  return (await request<{ groups: MyTicketsGroup[] }>('GET', `/api/me/tickets?scope=${scope}`)).groups;
}

// Organizers -----------------------------------------------------------------

export type TierInput = {
  name: string;
  description?: string | null;
  unit_amount: number;
  capacity: number;
  max_per_order?: number;
  max_per_user?: number | null;
  sales_start_at?: string | null;
  sales_end_at?: string | null;
  sort_order?: number;
};

export async function fetchManagedTiers(beaconId: string): Promise<ManagedTier[]> {
  return (await request<{ tiers: ManagedTier[] }>('GET', `${offeringsUrl(beaconId)}?manage=1`)).tiers;
}

export function createTier(beaconId: string, tier: TierInput): Promise<{ tier_id: string }> {
  return request('POST', offeringsUrl(beaconId), tier);
}

export function updateTier(
  beaconId: string,
  tierId: string,
  patch: Partial<TierInput> & { is_active?: boolean },
): Promise<{ ok: true }> {
  return request('PATCH', `${offeringsUrl(beaconId)}/${tierId}`, patch);
}

export function deleteTier(beaconId: string, tierId: string): Promise<{ deleted: 'archived' | 'removed' }> {
  return request('DELETE', `${offeringsUrl(beaconId)}/${tierId}`);
}

export function setTicketingStatus(
  beaconId: string,
  status: TicketingStatus | 'disabled',
): Promise<{ ticketing_status: string }> {
  return request('POST', `/api/beacons/${beaconId}/tickets/status`, { ticketing_status: status });
}

export function fetchSalesSummary(beaconId: string): Promise<TicketSalesSummary> {
  return request('GET', `/api/beacons/${beaconId}/tickets/summary`);
}

export function attendeesUrl(beaconId: string, query: string, cursor: string | null = null): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return `/api/beacons/${beaconId}/tickets/attendees${qs ? `?${qs}` : ''}`;
}

export function searchAttendees(url: string): Promise<{ attendees: TicketAttendee[]; next_cursor: string | null }> {
  return request('GET', url);
}

export function refundOrder(orderId: string, ticketIds?: string[]): Promise<{ refund_id: string; amount: number }> {
  return request('POST', `/api/orders/${orderId}/refunds`, ticketIds?.length ? { ticket_ids: ticketIds } : {});
}

export function cancelEvent(beaconId: string): Promise<{ refunds_started: number; refunds_failed: number }> {
  return request('POST', `/api/beacons/${beaconId}/cancel`);
}

export type PayoutStatus = { onboarding_state: string; can_sell: boolean };

export function fetchPayoutStatus(): Promise<PayoutStatus> {
  return request('GET', '/api/payments/connect/status');
}

/** Stripe's hosted onboarding page for the signed-in organizer. */
export async function connectOnboardingUrl(): Promise<string> {
  return (await request<{ onboarding_url: string }>('POST', '/api/payments/connect/onboarding')).onboarding_url;
}

// Copy -------------------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  network: 'Check your connection and try again.',
  price_changed: 'The price changed. Check the new total.',
  sales_ended: 'Sales for this event have closed.',
  sales_not_open: 'Sales for this event have closed.',
  sales_not_started: 'Sales haven’t started yet.',
  over_user_limit: 'You’ve reached the ticket limit for this event.',
  over_order_limit: 'That’s more tickets than one order allows.',
  tier_inactive: 'That ticket isn’t available anymore.',
  tier_not_found: 'That ticket isn’t available anymore.',
  event_cancelled: 'This event was cancelled.',
  organizer_not_ready: 'Tickets aren’t on sale yet.',
  mixed_order: 'Get free and paid tickets in separate orders.',
};

/** One short sentence for the buyer or organizer. */
export function ticketingErrorMessage(error: TicketingError): string {
  if (error.code === 'insufficient_inventory') {
    return error.remaining ? `Only ${error.remaining} left. We updated your selection.` : 'Sold out.';
  }
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  if (error.status === 401) return 'Sign in to continue.';
  if (error.status >= 400 && error.status < 500 && error.serverMessage) return error.serverMessage;
  return 'Something went wrong. Try again.';
}
