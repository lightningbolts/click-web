/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as postCheckout } from '@/app/api/beacons/[beaconId]/tickets/checkout/route';

const mockGetSupabaseFromRouteRequest = jest.fn();
const mockCreateAdminSupabaseClient = jest.fn();
const mockCreateTicketCheckout = jest.fn();

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetSupabaseFromRouteRequest(...args),
}));

jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => mockCreateAdminSupabaseClient(),
}));

jest.mock('@/lib/server/ticketing/checkout', () => ({
  createTicketCheckout: (...args: unknown[]) => mockCreateTicketCheckout(...args),
}));

const BEACON_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const TIER_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function checkoutRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/beacons/${BEACON_ID}/tickets/checkout`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function beaconParams() {
  return { params: Promise.resolve({ beaconId: BEACON_ID }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  mockGetSupabaseFromRouteRequest.mockResolvedValue({
    supabase: {},
    user: { id: USER_ID },
    authError: null,
  });
});

afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

describe('POST /api/beacons/[beaconId]/tickets/checkout', () => {
  it('is gated by the ticketing rollout flag', async () => {
    process.env.TICKETING_ENABLED = 'false';
    const res = await postCheckout(
      checkoutRequest({ items: [{ ticket_tier_id: TIER_ID, quantity: 1 }] }),
      beaconParams(),
    );
    expect(res.status).toBe(403);
    expect(mockCreateTicketCheckout).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    mockGetSupabaseFromRouteRequest.mockResolvedValue({
      supabase: {},
      user: null,
      authError: new Error('nope'),
    });
    const res = await postCheckout(
      checkoutRequest({ items: [{ ticket_tier_id: TIER_ID, quantity: 1 }] }),
      beaconParams(),
    );
    expect(res.status).toBe(401);
    expect(mockCreateTicketCheckout).not.toHaveBeenCalled();
  });

  it('rejects malformed bodies before touching inventory', async () => {
    const res = await postCheckout(checkoutRequest({ items: [] }), beaconParams());
    expect(res.status).toBe(400);
    expect(mockCreateTicketCheckout).not.toHaveBeenCalled();
  });

  it('rejects duplicate tiers in one order', async () => {
    const res = await postCheckout(
      checkoutRequest({
        items: [
          { ticket_tier_id: TIER_ID, quantity: 1 },
          { ticket_tier_id: TIER_ID, quantity: 2 },
        ],
      }),
      beaconParams(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('duplicate_tier');
    expect(mockCreateTicketCheckout).not.toHaveBeenCalled();
  });

  it('returns the hosted checkout URL from a successful reservation', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue({});
    mockCreateTicketCheckout.mockResolvedValue({
      ok: true,
      orderId: ORDER_ID,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test',
    });
    const res = await postCheckout(
      checkoutRequest({ items: [{ ticket_tier_id: TIER_ID, quantity: 2 }] }),
      beaconParams(),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order_id).toBe(ORDER_ID);
    expect(body.checkout_url).toContain('checkout.stripe.com');
    // Only the buyer id, beacon, and tier/quantity reach the checkout layer —
    // never client-supplied prices.
    expect(mockCreateTicketCheckout).toHaveBeenCalledWith({}, USER_ID, BEACON_ID, [
      { tierId: TIER_ID, quantity: 2 },
    ], { client: undefined });
  });

  it('reports free claims as fulfilled with no checkout URL', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue({});
    mockCreateTicketCheckout.mockResolvedValue({ ok: true, orderId: ORDER_ID, fulfilled: true });
    const res = await postCheckout(
      checkoutRequest({ items: [{ ticket_tier_id: TIER_ID, quantity: 1 }], client: 'ios' }),
      beaconParams(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order_id: ORDER_ID, status: 'fulfilled' });
    expect(mockCreateTicketCheckout).toHaveBeenCalledWith({}, USER_ID, BEACON_ID, [
      { tierId: TIER_ID, quantity: 1 },
    ], { client: 'ios' });
  });

  it('rejects orders mixing free and paid tickets', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue({});
    mockCreateTicketCheckout.mockResolvedValue({ ok: false, status: 400, code: 'mixed_order' });
    const res = await postCheckout(
      checkoutRequest({ items: [{ ticket_tier_id: TIER_ID, quantity: 1 }] }),
      beaconParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('mixed_order');
  });

  it('maps reservation failures onto their HTTP statuses', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue({});
    mockCreateTicketCheckout.mockResolvedValue({
      ok: false,
      status: 409,
      code: 'insufficient_inventory',
      extra: { remaining: 1 },
    });
    const res = await postCheckout(
      checkoutRequest({ items: [{ ticket_tier_id: TIER_ID, quantity: 4 }] }),
      beaconParams(),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('insufficient_inventory');
    expect(body.remaining).toBe(1);
  });
});
