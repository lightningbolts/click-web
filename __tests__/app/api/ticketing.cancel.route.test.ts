/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockRequireEventManager = jest.fn();
const mockGetUser = jest.fn();
const mockRevalidate = jest.fn();
const mockRefund = jest.fn();
const mockExpireSession = jest.fn();
let db: FakeDb;

jest.mock('@/lib/events/requireEventManager', () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));
jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => db.client }));
jest.mock('@/lib/server/events/revalidatePublicEvents', () => ({
  revalidatePublicEvents: (...args: unknown[]) => mockRevalidate(...args),
}));
jest.mock('@/lib/server/ticketing/refunds', () => ({
  requestTicketRefund: (...args: unknown[]) => mockRefund(...args),
}));
jest.mock('@/lib/server/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { expire: (...args: unknown[]) => mockExpireSession(...args) } } }),
}));
jest.mock('@/lib/server/cronAuth', () => ({ authorizeCronRequest: () => true }));
jest.mock('@/lib/server/eventHubLifecycle', () => ({
  findHubForEventBeacon: async () => null,
  syncEventHubFromBeacon: async () => undefined,
}));

import { POST as cancel } from '@/app/api/beacons/[beaconId]/cancel/route';
import { DELETE } from '@/app/api/beacons/[beaconId]/route';
import { GET as cron } from '@/app/api/cron/ticketing-expiry/route';

const EVENT = '11111111-1111-4111-8111-111111111111';
const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const order = (id: string, order_state: string, over: Record<string, unknown> = {}) => ({
  id,
  beacon_id: EVENT,
  buyer_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  order_state,
  total_amount: 1500,
  stripe_checkout_session_id: `cs_${id}`,
  stripe_payment_intent_id: `pi_${id}`,
  ...over,
});

function world(opts: { orders?: Record<string, unknown>[]; cancelledAt?: string | null; refundIds?: string[]; cancelFails?: boolean } = {}) {
  db = new FakeDb({
    tables: {
      map_beacons: [
        {
          id: EVENT,
          creator_id: HOST,
          venue_id: null,
          hub_id: null,
          beacon_type: 'event',
          metadata: {},
          event_cancelled_at: opts.cancelledAt ?? null,
        },
      ],
      ticket_orders: opts.orders ?? [order('o1', 'paid'), order('o2', 'paid'), order('o3', 'checkout_created')],
    },
    rpc: {
      ticketing_cancel_event: () => {
        if (opts.cancelFails) throw new Error('connection reset');
        return { ok: true, refund_order_ids: opts.refundIds ?? ['o1', 'o2'] };
      },
      ticketing_expire_stale: () => 0,
    },
  });
  mockRequireEventManager.mockResolvedValue({ ok: true, admin: db.client, userId: HOST, beacon: { id: EVENT, venue_id: null }, access: 'manage' });
  mockGetUser.mockResolvedValue({ supabase: db.client, user: { id: HOST }, authError: null });
}

const params = { params: Promise.resolve({ beaconId: EVENT }) };
const post = () => cancel(new NextRequest(`https://click.example/api/beacons/${EVENT}/cancel`, { method: 'POST' }), params);
const refundedOrders = () => mockRefund.mock.calls.map(([, order]) => (order as { id: string }).id);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  mockRefund.mockResolvedValue({ ok: true, refundId: 'r', stripeRefundId: 're', amount: 1500 });
  mockExpireSession.mockResolvedValue({});
  world();
});
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

describe('POST /api/beacons/:id/cancel', () => {
  it('cancels the event, refunds every paid order and closes open checkouts', async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refunds_started: 2, refunds_failed: 0 });
    expect(db.log).toContainEqual(expect.objectContaining({ table: 'rpc:ticketing_cancel_event', payload: { p_beacon: EVENT } }));
    expect(refundedOrders()).toEqual(['o1', 'o2']);
    expect(mockRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'o1' }), HOST, null, 'event_cancelled');
    // A buyer still on Stripe's page can't pay for a ticket that no longer exists.
    expect(mockExpireSession).toHaveBeenCalledWith('cs_o3');
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT, null);
  });

  it('refreshes the event page even when the cancel fails partway', async () => {
    world({ cancelFails: true });
    expect((await post()).status).toBe(500);
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT, null);
  });

  it('keeps going when one refund fails', async () => {
    mockRefund.mockRejectedValueOnce(new Error('stripe down'));
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refunds_started: 1, refunds_failed: 1 });
    expect(refundedOrders()).toEqual(['o1', 'o2']);
  });

  it('counts a refused refund as failed', async () => {
    mockRefund.mockResolvedValueOnce({ ok: false, status: 500, code: 'refund_record_failed' });
    expect(await (await post()).json()).toEqual({ refunds_started: 1, refunds_failed: 1 });
  });

  it('is safe to press twice: the same refunds are requested again', async () => {
    await post();
    await post();
    expect(refundedOrders()).toEqual(['o1', 'o2', 'o1', 'o2']);
    expect(mockRefund.mock.calls[0]).toEqual(mockRefund.mock.calls[2]);
  });

  it('a session that already closed does not fail the cancel', async () => {
    mockExpireSession.mockRejectedValue(new Error('session is not open'));
    expect((await post()).status).toBe(200);
  });

  it('is for people who manage the event', async () => {
    mockRequireEventManager.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await post()).status).toBe(403);
    expect(mockRequireEventManager).toHaveBeenCalledWith(expect.anything(), EVENT);
  });
});

describe('DELETE /api/beacons/:id', () => {
  const del = () => DELETE(new NextRequest(`https://click.example/api/beacons/${EVENT}`, { method: 'DELETE' }), params);

  it('refuses to delete an event with ticket orders', async () => {
    const res = await del();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('has_ticket_orders');
    expect(db.rows('map_beacons')).toHaveLength(1);
  });

  it('deletes events without orders as before', async () => {
    world({ orders: [] });
    const res = await del();
    expect(res.status).toBe(200);
    expect(db.rows('map_beacons')).toHaveLength(0);
  });
});

describe('ticketing cron', () => {
  it('retries refunds for cancelled events', async () => {
    world({
      cancelledAt: new Date(Date.now() - 86_400_000).toISOString(),
      orders: [order('o1', 'paid'), order('o2', 'partially_refunded'), order('o3', 'refunded'), order('o4', 'paid', { total_amount: 0 })],
    });
    const res = await cron(new NextRequest('https://click.example/api/cron/ticketing-expiry'));
    expect(await res.json()).toMatchObject({ ok: true, expired: 0, refunds_retried: 2 });
    expect(refundedOrders()).toEqual(['o1', 'o2']);
    expect(mockRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'o1' }), HOST, null, 'event_cancelled');
  });

  it('takes the longest-waiting orders first and sends refused ones to the back of the queue', async () => {
    world({
      cancelledAt: new Date(Date.now() - 86_400_000).toISOString(),
      orders: [
        order('o1', 'paid', { updated_at: '2026-10-05T00:00:00.000Z' }),
        order('o2', 'paid', { updated_at: '2026-10-01T00:00:00.000Z', stripe_payment_intent_id: null }),
      ],
    });
    mockRefund.mockImplementation(async (_admin: unknown, o: { id: string }) =>
      o.id === 'o2' ? { ok: false, code: 'order_missing_payment_intent', status: 409 } : { ok: true, refundId: 'r', stripeRefundId: 're', amount: 1500 },
    );
    await cron(new NextRequest('https://click.example/api/cron/ticketing-expiry'));
    expect(refundedOrders()).toEqual(['o2', 'o1']);
    const o2 = db.rows('ticket_orders').find((o) => o.id === 'o2')!;
    expect(Date.parse(o2.updated_at as string)).toBeGreaterThan(Date.parse('2026-10-05T00:00:00.000Z'));
  });

  it('leaves live events alone', async () => {
    const res = await cron(new NextRequest('https://click.example/api/cron/ticketing-expiry'));
    expect(await res.json()).toMatchObject({ refunds_retried: 0 });
    expect(mockRefund).not.toHaveBeenCalled();
  });
});
