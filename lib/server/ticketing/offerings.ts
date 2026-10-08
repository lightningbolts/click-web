import type { SupabaseClient } from '@supabase/supabase-js';
import { ticketingEnabled } from '@/lib/server/ticketing/enabled';
import type {
  EventTicketing,
  ManagedTier,
  TicketingStatus,
  TicketOffering,
  TierAvailability,
} from '@/lib/ticketing/types';

/**
 * What an event's tiers look like to a buyer right now. Availability is derived here, once,
 * for the event page, the iOS picker and the organizer view; the database re-checks every rule
 * under row locks at purchase time, so this is display, never authorization.
 */

/** Show the exact count only when few are left. */
const LOW_STOCK = 10;

export type TierRow = {
  id: string;
  name: string;
  description: string | null;
  unit_amount: number;
  currency: string;
  capacity: number;
  max_per_order: number;
  max_per_user: number | null;
  sales_start_at: string | null;
  sales_end_at: string | null;
  sort_order: number;
  is_active: boolean;
};

export type TierCounts = { sold: number; held: number; checked_in: number };

export type EventSalesRow = {
  admission_type: string;
  ticketing_status: string;
  ticket_sales_start_at: string | null;
  ticket_sales_end_at: string | null;
  event_cancelled_at: string | null;
};

export const EVENT_SALES_COLUMNS =
  'admission_type, ticketing_status, ticket_sales_start_at, ticket_sales_end_at, event_cancelled_at';
const TIER_COLUMNS =
  'id, name, description, unit_amount, currency, capacity, max_per_order, max_per_user, sales_start_at, sales_end_at, sort_order, is_active';

const NO_COUNTS: TierCounts = { sold: 0, held: 0, checked_in: 0 };

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return (ms(a) ?? 0) >= (ms(b) ?? 0) ? a : b;
}

function earlier(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return (ms(a) ?? 0) <= (ms(b) ?? 0) ? a : b;
}

function availabilityOf(
  event: EventSalesRow,
  start: string | null,
  end: string | null,
  left: number,
  nowMs: number,
): TierAvailability {
  if (event.event_cancelled_at || event.ticketing_status === 'sales_closed') return 'ended';
  if (event.ticketing_status !== 'sales_open') return 'paused';
  const startMs = ms(start);
  if (startMs != null && nowMs < startMs) return 'not_started';
  const endMs = ms(end);
  if (endMs != null && nowMs > endMs) return 'ended';
  return left > 0 ? 'on_sale' : 'sold_out';
}

export function deriveOffering(
  tier: TierRow,
  counts: TierCounts,
  event: EventSalesRow,
  ownedForTier: number,
  nowMs: number,
): TicketOffering {
  const start = later(event.ticket_sales_start_at, tier.sales_start_at);
  const end = earlier(event.ticket_sales_end_at, tier.sales_end_at);
  const left = Math.max(tier.capacity - counts.sold - counts.held, 0);
  const availability = availabilityOf(event, start, end, left, nowMs);
  const perPerson = tier.max_per_user == null ? Infinity : Math.max(tier.max_per_user - ownedForTier, 0);
  return {
    id: tier.id,
    name: tier.name,
    description: tier.description,
    unit_amount: tier.unit_amount,
    currency: tier.currency,
    availability,
    remaining: left <= LOW_STOCK ? left : null,
    max_quantity: availability === 'on_sale' ? Math.min(tier.max_per_order, left, perPerson) : 0,
    sales_start_at: start,
    sales_end_at: end,
  };
}

export function summarizeEventTicketing(event: EventSalesRow, offerings: TicketOffering[]): EventTicketing | null {
  if (!ticketingEnabled() || event.admission_type !== 'ticketed') return null;
  const cancelled = event.event_cancelled_at != null;
  return {
    status: (event.ticketing_status === 'disabled' ? 'draft' : event.ticketing_status) as TicketingStatus,
    cancelled,
    from_amount: offerings.length ? Math.min(...offerings.map((o) => o.unit_amount)) : null,
    currency: offerings[0]?.currency ?? 'usd',
    available: !cancelled && offerings.some((o) => o.availability === 'on_sale'),
  };
}

export async function loadTierCounts(admin: SupabaseClient, beaconId: string): Promise<Map<string, TierCounts>> {
  const { data, error } = await admin.rpc('ticketing_tier_counts', { p_beacon: beaconId });
  if (error) throw new Error(`ticketing_tier_counts failed: ${error.message}`);
  const counts = new Map<string, TierCounts>();
  for (const row of (data as ({ tier_id: string } & TierCounts)[]) ?? []) {
    counts.set(row.tier_id, { sold: row.sold, held: row.held, checked_in: row.checked_in });
  }
  return counts;
}

async function loadEventSales(admin: SupabaseClient, beaconId: string): Promise<EventSalesRow | null> {
  const { data, error } = await admin
    .from('map_beacons')
    .select(EVENT_SALES_COLUMNS)
    .eq('id', beaconId)
    .eq('beacon_type', 'event')
    .maybeSingle();
  if (error) throw new Error(`event sales load failed: ${error.message}`);
  return (data as EventSalesRow | null) ?? null;
}

async function loadTiers(admin: SupabaseClient, beaconId: string, activeOnly: boolean): Promise<TierRow[]> {
  let query = admin.from('ticket_tiers').select(TIER_COLUMNS).eq('beacon_id', beaconId).is('archived_at', null);
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query.order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (error) throw new Error(`ticket_tiers load failed: ${error.message}`);
  return (data as TierRow[]) ?? [];
}

async function ownedByTier(admin: SupabaseClient, beaconId: string, userId: string): Promise<Map<string, number>> {
  const { data, error } = await admin
    .from('tickets')
    .select('ticket_tier_id')
    .eq('beacon_id', beaconId)
    .eq('owner_user_id', userId)
    .in('status', ['valid', 'checked_in']);
  if (error) throw new Error(`owned tickets load failed: ${error.message}`);
  const owned = new Map<string, number>();
  for (const row of (data as { ticket_tier_id: string }[]) ?? []) {
    owned.set(row.ticket_tier_id, (owned.get(row.ticket_tier_id) ?? 0) + 1);
  }
  return owned;
}

/** Buyer-facing tiers (active, unarchived, in display order), or null when the event doesn't exist. */
export async function loadOfferings(
  admin: SupabaseClient,
  beaconId: string,
  viewerId: string | null,
  nowMs: number,
): Promise<{ event: EventSalesRow; offerings: TicketOffering[] } | null> {
  const event = await loadEventSales(admin, beaconId);
  if (!event) return null;
  const [tiers, counts, owned] = await Promise.all([
    loadTiers(admin, beaconId, true),
    loadTierCounts(admin, beaconId),
    viewerId ? ownedByTier(admin, beaconId, viewerId) : Promise.resolve(new Map<string, number>()),
  ]);
  const offerings = tiers.map((tier) =>
    deriveOffering(tier, counts.get(tier.id) ?? NO_COUNTS, event, owned.get(tier.id) ?? 0, nowMs),
  );
  return { event, offerings };
}

/** Every unarchived tier with its counts, for the organizer (hidden tiers included). */
export async function loadManagedTiers(admin: SupabaseClient, beaconId: string, nowMs: number): Promise<ManagedTier[]> {
  const event = await loadEventSales(admin, beaconId);
  if (!event) return [];
  const [tiers, counts] = await Promise.all([loadTiers(admin, beaconId, false), loadTierCounts(admin, beaconId)]);
  return tiers.map((tier) => {
    const tierCounts = counts.get(tier.id) ?? NO_COUNTS;
    return {
      ...deriveOffering(tier, tierCounts, event, 0, nowMs),
      ...tierCounts,
      capacity: tier.capacity,
      is_active: tier.is_active,
      max_per_order: tier.max_per_order,
      max_per_user: tier.max_per_user,
      sort_order: tier.sort_order,
    };
  });
}

/** The event-level summary, or null for RSVP events and while ticketing is off (no queries then). */
export async function loadEventTicketing(
  admin: SupabaseClient,
  beaconId: string,
  nowMs: number,
  event?: EventSalesRow,
): Promise<EventTicketing | null> {
  if (!ticketingEnabled()) return null;
  if (event && event.admission_type !== 'ticketed') return null;
  const loaded = await loadOfferings(admin, beaconId, null, nowMs);
  if (!loaded) return null;
  return summarizeEventTicketing(loaded.event, loaded.offerings);
}

export async function countMyLiveTickets(admin: SupabaseClient, beaconId: string, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('beacon_id', beaconId)
    .eq('owner_user_id', userId)
    .in('status', ['valid', 'checked_in']);
  if (error) throw new Error(`my tickets count failed: ${error.message}`);
  return count ?? 0;
}
