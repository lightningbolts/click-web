/**
 * @jest-environment node
 */
import {
  deriveOffering,
  summarizeEventTicketing,
  type EventSalesRow,
  type TierRow,
} from '@/lib/server/ticketing/offerings';
import type { TicketOffering } from '@/lib/ticketing/types';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const PAST = '2026-10-01T00:00:00Z';
const FUTURE = '2026-10-20T00:00:00Z';

const tier = (over: Partial<TierRow> = {}): TierRow => ({
  id: 't1',
  name: 'General',
  description: null,
  unit_amount: 1500,
  currency: 'usd',
  capacity: 100,
  max_per_order: 8,
  max_per_user: null,
  sales_start_at: null,
  sales_end_at: null,
  sort_order: 0,
  is_active: true,
  ...over,
});
const event = (over: Partial<EventSalesRow> = {}): EventSalesRow => ({
  admission_type: 'ticketed',
  ticketing_status: 'sales_open',
  ticket_sales_start_at: null,
  ticket_sales_end_at: null,
  event_cancelled_at: null,
  ...over,
});
const counts = (sold = 0, held = 0) => ({ sold, held, checked_in: 0 });

describe('deriveOffering availability', () => {
  it.each([
    ['paused event', event({ ticketing_status: 'sales_paused' }), tier(), 'paused'],
    ['draft event', event({ ticketing_status: 'draft' }), tier(), 'paused'],
    ['closed event', event({ ticketing_status: 'sales_closed' }), tier(), 'ended'],
    ['cancelled event', event({ event_cancelled_at: PAST }), tier(), 'ended'],
    ['event window not started', event({ ticket_sales_start_at: FUTURE }), tier(), 'not_started'],
    ['event window ended', event({ ticket_sales_end_at: PAST }), tier(), 'ended'],
    ['tier window not started', event(), tier({ sales_start_at: FUTURE }), 'not_started'],
    ['tier window ended', event(), tier({ sales_end_at: PAST }), 'ended'],
    ['open', event(), tier(), 'on_sale'],
  ] as const)('%s → %s', (_label, e, t, expected) => {
    expect(deriveOffering(t, counts(), e, 0, NOW).availability).toBe(expected);
  });

  it('reports the later of the event and tier start for not-started tiers', () => {
    expect(deriveOffering(tier({ sales_start_at: FUTURE }), counts(), event(), 0, NOW).sales_start_at).toBe(FUTURE);
  });
});

describe('deriveOffering stock', () => {
  it('shows remaining only when it is low', () => {
    expect(deriveOffering(tier(), counts(90), event(), 0, NOW)).toMatchObject({ availability: 'on_sale', remaining: 10 });
    expect(deriveOffering(tier(), counts(50), event(), 0, NOW).remaining).toBeNull();
  });

  it('counts checkout holds as taken', () => {
    expect(deriveOffering(tier(), counts(98, 2), event(), 0, NOW)).toMatchObject({
      availability: 'sold_out',
      remaining: 0,
      max_quantity: 0,
    });
  });

  it('caps the quantity by order limit, stock and the per-person limit', () => {
    expect(deriveOffering(tier({ max_per_user: 4 }), counts(97), event(), 2, NOW).max_quantity).toBe(2);
    expect(deriveOffering(tier(), counts(97), event(), 2, NOW).max_quantity).toBe(3);
    expect(deriveOffering(tier(), counts(0), event(), 0, NOW).max_quantity).toBe(8);
    expect(deriveOffering(tier({ max_per_user: 2 }), counts(0), event(), 3, NOW).max_quantity).toBe(0);
  });

  it('offers nothing to buy while unavailable', () => {
    expect(deriveOffering(tier(), counts(), event({ ticketing_status: 'sales_paused' }), 0, NOW).max_quantity).toBe(0);
  });
});

describe('summarizeEventTicketing', () => {
  const offering = (over: Partial<TicketOffering>): TicketOffering => ({
    ...deriveOffering(tier(), counts(), event(), 0, NOW),
    ...over,
  });
  const ORIGINAL = process.env.TICKETING_ENABLED;
  beforeEach(() => {
    process.env.TICKETING_ENABLED = 'true';
  });
  afterAll(() => {
    process.env.TICKETING_ENABLED = ORIGINAL;
  });

  it('summarizes the cheapest price and whether anything is on sale', () => {
    const summary = summarizeEventTicketing(event(), [
      offering({ unit_amount: 2500, availability: 'sold_out' }),
      offering({ unit_amount: 1200 }),
    ]);
    expect(summary).toEqual({ status: 'sales_open', cancelled: false, from_amount: 1200, currency: 'usd', available: true });
  });

  it('reports a free tier as from 0 and nothing available when all are sold out', () => {
    const summary = summarizeEventTicketing(event(), [
      offering({ unit_amount: 0, availability: 'sold_out' }),
      offering({ unit_amount: 1500, availability: 'sold_out' }),
    ]);
    expect(summary).toMatchObject({ from_amount: 0, available: false });
  });

  it('flags cancelled events', () => {
    expect(summarizeEventTicketing(event({ event_cancelled_at: PAST }), [])).toMatchObject({
      cancelled: true,
      from_amount: null,
      available: false,
    });
  });

  it('is null for RSVP events and when ticketing is off', () => {
    expect(summarizeEventTicketing(event({ admission_type: 'rsvp' }), [])).toBeNull();
    process.env.TICKETING_ENABLED = 'false';
    expect(summarizeEventTicketing(event(), [])).toBeNull();
  });
});
