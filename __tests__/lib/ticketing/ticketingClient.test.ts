/**
 * @jest-environment node
 */
jest.mock('@/lib/auth/freshAuthHeaders', () => ({ getFreshAuthHeaders: async () => ({ Authorization: 'Bearer t' }) }));

import {
  TicketingError,
  checkInTicket,
  orderOutcome,
  startCheckout,
  ticketingErrorMessage,
  type OrderProjection,
} from '@/lib/ticketing/ticketingClient';

const EVENT = '11111111-1111-4111-8111-111111111111';
const order = (order_state: string, fulfillment_state = 'unfulfilled'): OrderProjection => ({
  id: 'o',
  beacon_id: EVENT,
  order_state,
  fulfillment_state,
  total_amount: 1500,
  ticket_count: 0,
});

const respond = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

afterEach(() => jest.restoreAllMocks());

describe('orderOutcome', () => {
  it.each([
    [order('paid', 'fulfilled'), 'confirmed'],
    [order('paid'), 'pending'],
    [order('reserved'), 'pending'],
    [order('checkout_created'), 'pending'],
    [order('payment_processing'), 'pending'],
    [order('canceled'), 'canceled'],
    [order('payment_failed'), 'failed'],
    [order('expired'), 'expired'],
    [order('refunded', 'voided'), 'refunded'],
    [order('partially_refunded', 'fulfilled'), 'confirmed'],
    [order('disputed', 'fulfilled'), 'confirmed'],
  ])('%o → %s', (projection, outcome) => {
    expect(orderOutcome(projection)).toBe(outcome);
  });
});

describe('startCheckout', () => {
  it('sends only tier ids and quantities, authenticated, uncached', async () => {
    const fetchMock = respond(200, { order_id: 'o', status: 'fulfilled' });
    global.fetch = fetchMock;
    await expect(startCheckout(EVENT, [{ ticket_tier_id: 't', quantity: 2 }])).resolves.toEqual({ order_id: 'o', status: 'fulfilled' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/beacons/${EVENT}/tickets/checkout`);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store' });
    expect(init.headers).toMatchObject({ Authorization: 'Bearer t', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ items: [{ ticket_tier_id: 't', quantity: 2 }], client: 'web' });
  });

  it('turns a refusal into a TicketingError with its code and what is left', async () => {
    global.fetch = respond(409, { error: 'Checkout unavailable', code: 'insufficient_inventory', remaining: 2 });
    const error = await startCheckout(EVENT, [{ ticket_tier_id: 't', quantity: 4 }]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TicketingError);
    expect(error).toMatchObject({ status: 409, code: 'insufficient_inventory', remaining: 2 });
  });

  it('reports a dropped connection as a network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await startCheckout(EVENT, []).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: 'network' });
  });
});

describe('checkInTicket', () => {
  it('admits one ticket by id through the door scanner', async () => {
    const fetchMock = respond(200, { result: 'checked_in', checked_in_at: '2026-10-10T03:04:00Z', attendee: null });
    global.fetch = fetchMock;
    await expect(checkInTicket(EVENT, 't1')).resolves.toMatchObject({ result: 'checked_in', checked_in_at: '2026-10-10T03:04:00Z' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/beacons/${EVENT}/pass/scan`);
    expect(JSON.parse(init.body)).toEqual({ ticket_id: 't1' });
  });
});

describe('ticketingErrorMessage', () => {
  it.each([
    [new TicketingError(409, 'insufficient_inventory', 2), 'Only 2 left. We updated your selection.'],
    [new TicketingError(409, 'insufficient_inventory', 0), 'Sold out.'],
    [new TicketingError(409, 'insufficient_inventory'), 'Sold out.'],
    [new TicketingError(409, 'price_changed'), 'The price changed. Check the new total.'],
    [new TicketingError(409, 'sales_ended'), 'Sales for this event have closed.'],
    [new TicketingError(409, 'sales_not_open'), 'Sales for this event have closed.'],
    [new TicketingError(409, 'over_user_limit'), 'You’ve reached the ticket limit for this event.'],
    [new TicketingError(0, 'network'), 'Check your connection and try again.'],
    [new TicketingError(500, null), 'Something went wrong. Try again.'],
  ])('%s', (error, message) => {
    expect(ticketingErrorMessage(error)).toBe(message);
  });
});
