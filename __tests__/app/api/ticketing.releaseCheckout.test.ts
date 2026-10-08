/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockExpire = jest.fn();
let db: FakeDb;

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => db.client }));
jest.mock('@/lib/server/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { expire: (...args: unknown[]) => mockExpire(...args) } } }),
  getAppBaseUrl: () => 'https://click.example',
}));

import { DELETE } from '@/app/api/orders/[orderId]/route';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOMEONE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORDER = '22222222-2222-4222-8222-222222222222';

function world(orderState = 'checkout_created') {
  db = new FakeDb({
    rpc: { ticketing_cancel_order: () => ({ ok: true, order_state: 'canceled' }) },
    tables: {
      ticket_orders: [
        { id: ORDER, buyer_user_id: ME, order_state: orderState, stripe_checkout_session_id: 'cs_test_1' },
      ],
    },
  });
}

const release = () =>
  DELETE(new NextRequest(`https://click.example/api/orders/${ORDER}`, { method: 'DELETE' }), {
    params: Promise.resolve({ orderId: ORDER }),
  });
const cancelCalls = () => db.log.filter((entry) => entry.table === 'rpc:ticketing_cancel_order');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  mockGetUser.mockResolvedValue({ user: { id: ME }, authError: null });
  mockExpire.mockResolvedValue({ status: 'expired' });
  world();
});
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

describe('DELETE /api/orders/[orderId] (leaving checkout)', () => {
  it('expires the checkout and frees the held tickets right away', async () => {
    const res = await release();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order_state: 'canceled' });
    expect(mockExpire).toHaveBeenCalledWith('cs_test_1');
    expect(cancelCalls()[0]!.payload).toEqual({ p_order: ORDER, p_target_state: 'canceled' });
  });

  it("404s someone else's order without touching it", async () => {
    mockGetUser.mockResolvedValue({ user: { id: SOMEONE }, authError: null });
    expect((await release()).status).toBe(404);
    expect(mockExpire).not.toHaveBeenCalled();
    expect(cancelCalls()).toHaveLength(0);
  });

  it('leaves a paid order alone', async () => {
    world('paid');
    const res = await release();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('order_not_cancelable');
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it('keeps the hold when the payment already went through (session can no longer expire)', async () => {
    mockExpire.mockRejectedValue(new Error('Only Checkout Sessions with a status of open can be expired.'));
    const res = await release();
    expect(res.status).toBe(409);
    expect(cancelCalls()).toHaveLength(0);
  });

  it('requires sign-in', async () => {
    mockGetUser.mockResolvedValue({ user: null, authError: null });
    expect((await release()).status).toBe(401);
  });
});
