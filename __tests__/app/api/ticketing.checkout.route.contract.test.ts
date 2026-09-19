/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { POST as postCheckout } from '@/app/api/beacons/[beaconId]/tickets/checkout/route';
import { GET as getOrder } from '@/app/api/orders/[orderId]/route';

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
    ]);
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

describe('GET /api/orders/[orderId]', () => {
  function orderRequest(): NextRequest {
    return new NextRequest(`http://localhost/api/orders/${ORDER_ID}`);
  }

  function orderParams() {
    return { params: Promise.resolve({ orderId: ORDER_ID }) };
  }

  function adminReturningOrder(order: unknown) {
    return {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: order, error: null }),
          }),
        }),
      }),
    };
  }

  it('hides other buyers’ orders as 404', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue(
      adminReturningOrder({ id: ORDER_ID, buyer_user_id: 'someone-else' }),
    );
    const res = await getOrder(orderRequest(), orderParams());
    expect(res.status).toBe(404);
  });

  it('returns the buyer’s own order without the buyer id', async () => {
    mockCreateAdminSupabaseClient.mockReturnValue(
      adminReturningOrder({
        id: ORDER_ID,
        buyer_user_id: USER_ID,
        order_state: 'paid',
        fulfillment_state: 'fulfilled',
      }),
    );
    const res = await getOrder(orderRequest(), orderParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order.order_state).toBe('paid');
    expect(body.order.buyer_user_id).toBeUndefined();
  });
});
