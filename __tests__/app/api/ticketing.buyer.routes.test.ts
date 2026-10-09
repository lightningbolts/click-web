/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
let db: FakeDb;

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => db.client }));
jest.mock('@/lib/server/runtimeEnv', () => ({
  runtimeEnv: (name: string) => (name === 'EVENT_PASS_SECRET' ? 'test-pass-secret' : undefined),
}));

import { GET as getEventTickets } from '@/app/api/beacons/[beaconId]/tickets/route';
import { GET as getMyTickets } from '@/app/api/me/tickets/route';
import { GET as getTicket } from '@/app/api/tickets/[ticketId]/route';
import { GET as getOrder } from '@/app/api/orders/[orderId]/route';
import { GET as getFeatures } from '@/app/api/me/features/route';

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SOMEONE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOON = '11111111-1111-4111-8111-111111111111';
const LATER = '11111111-1111-4111-8111-111111111112';
const DONE = '11111111-1111-4111-8111-111111111113';
const ORDER = '22222222-2222-4222-8222-222222222222';
const T_VALID = '44444444-4444-4444-8444-444444444441';
const T_REFUNDED = '44444444-4444-4444-8444-444444444442';
const T_LATER = '44444444-4444-4444-8444-444444444443';
const T_DONE = '44444444-4444-4444-8444-444444444444';
const T_OTHER = '44444444-4444-4444-8444-444444444445';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const event = (id: string, starts_at: string, ends_at: string | null, title: string) => ({
  id,
  metadata: { title, location_name: 'The Crocodile' },
  starts_at,
  ends_at,
  event_timezone: 'America/Los_Angeles',
  cover_theme_id: null,
  event_cancelled_at: null,
});
const ticket = (id: string, beacon: ReturnType<typeof event>, over: Record<string, unknown> = {}) => ({
  id,
  beacon_id: beacon.id,
  order_id: ORDER,
  owner_user_id: ME,
  status: 'valid',
  ticket_number: `CLK-${id.slice(-4)}`,
  issued_at: '2026-10-01T00:00:00Z',
  checked_in_at: null,
  ticket_tiers: { name: 'GA' },
  map_beacons: beacon,
  ...over,
});

function world() {
  const soon = event(SOON, '2026-10-09T03:00:00Z', null, 'Soon');
  const later = event(LATER, '2026-11-01T03:00:00Z', '2026-11-01T06:00:00Z', 'Later');
  // Started 5 hours ago with no end: still upcoming inside the 6-hour grace.
  const done = event(DONE, '2026-10-01T03:00:00Z', '2026-10-01T06:00:00Z', 'Done');
  db = new FakeDb({
    tables: {
      tickets: [
        ticket(T_LATER, later),
        ticket(T_VALID, soon),
        ticket(T_REFUNDED, soon, { status: 'refunded' }),
        ticket(T_DONE, done, { status: 'checked_in', checked_in_at: '2026-10-01T04:00:00Z' }),
        ticket(T_OTHER, soon, { owner_user_id: SOMEONE }),
      ],
      ticket_orders: [
        {
          id: ORDER,
          beacon_id: SOON,
          buyer_user_id: ME,
          currency: 'usd',
          subtotal_amount: 3000,
          platform_fee_amount: 150,
          total_amount: 3000,
          order_state: 'paid',
          fulfillment_state: 'fulfilled',
          checkout_expires_at: null,
          paid_at: '2026-10-01T00:00:00Z',
          created_at: '2026-10-01T00:00:00Z',
          ticket_order_items: [{ tier_name_snapshot: 'GA', quantity: 2, unit_amount: 1500 }],
          ticket_refunds: [
            { amount: 1500, status: 'succeeded' },
            { amount: 1500, status: 'failed' },
          ],
        },
      ],
    },
  });
}

const get = (url: string) => new NextRequest(`https://click.example${url}`);
const signedIn = () => mockGetUser.mockResolvedValue({ user: { id: ME }, authError: null });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  process.env.TICKETING_ENABLED = 'true';
  signedIn();
  world();
});
afterEach(() => jest.useRealTimers());
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

describe('buyer ticket routes', () => {
  it('returns identical credentials on repeated reads', async () => {
    const read = async () =>
      (await (await getEventTickets(get(`/api/beacons/${SOON}/tickets`), { params: Promise.resolve({ beaconId: SOON }) })).json())
        .tickets;
    const first = await read();
    const second = await read();
    const valid = first.find((t: { id: string }) => t.id === T_VALID);
    expect(valid.credential_url).toMatch(new RegExp(`/e/${SOON}\\?pass=2\\.`));
    expect(valid.code).toEqual(expect.any(String));
    expect(second).toEqual(first);
    expect(db.log.filter((entry) => entry.op === 'update')).toEqual([]);
  });

  it('shows only my tickets, without credentials once refunded', async () => {
    const res = await getEventTickets(get(`/api/beacons/${SOON}/tickets`), { params: Promise.resolve({ beaconId: SOON }) });
    const { tickets } = await res.json();
    expect(tickets.map((t: { id: string }) => t.id).sort()).toEqual([T_VALID, T_REFUNDED]);
    expect(tickets.find((t: { id: string }) => t.id === T_REFUNDED)).toMatchObject({
      status: 'refunded',
      credential_url: null,
      code: null,
      tier_name: 'GA',
    });
  });

  it('requires sign-in', async () => {
    mockGetUser.mockResolvedValue({ user: null, authError: null });
    expect((await getMyTickets(get('/api/me/tickets'))).status).toBe(401);
    expect((await getTicket(get(`/api/tickets/${T_VALID}`), { params: Promise.resolve({ ticketId: T_VALID }) })).status).toBe(401);
    expect((await getOrder(get(`/api/orders/${ORDER}`), { params: Promise.resolve({ orderId: ORDER }) })).status).toBe(401);
  });

  it('groups upcoming tickets soonest first and past tickets latest first', async () => {
    const upcoming = await (await getMyTickets(get('/api/me/tickets?scope=upcoming'))).json();
    expect(upcoming.groups.map((g: { event: { title: string } }) => g.event.title)).toEqual(['Soon', 'Later']);
    expect(upcoming.groups[0].event).toEqual({
      beacon_id: SOON,
      title: 'Soon',
      start_at: '2026-10-09T03:00:00.000Z',
      end_at: null,
      timezone: 'America/Los_Angeles',
      location_name: 'The Crocodile',
      image_url: null,
      visual_seed: SOON,
      cancelled: false,
    });
    expect(upcoming.groups[0].tickets).toHaveLength(2);

    const past = await (await getMyTickets(get('/api/me/tickets?scope=past'))).json();
    expect(past.groups.map((g: { event: { title: string } }) => g.event.title)).toEqual(['Done']);
  });

  it("404s another person's ticket", async () => {
    const res = await getTicket(get(`/api/tickets/${T_OTHER}`), { params: Promise.resolve({ ticketId: T_OTHER }) });
    expect(res.status).toBe(404);
  });

  it('shows a ticket with its order and never the real platform fee', async () => {
    const res = await getTicket(get(`/api/tickets/${T_VALID}`), { params: Promise.resolve({ ticketId: T_VALID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toMatchObject({ id: T_VALID, status: 'valid', ticket_number: 'CLK-4441' });
    expect(body.event.title).toBe('Soon');
    expect(body.order).toEqual({
      id: ORDER,
      items: [{ tier_name: 'GA', quantity: 2, unit_amount: 1500 }],
      subtotal_amount: 3000,
      platform_fee_amount: 0,
      total_amount: 3000,
      currency: 'usd',
      paid_at: '2026-10-01T00:00:00Z',
      refunded_amount: 1500,
    });
  });

  it('reports the order with its ticket count and hides the fee and buyer', async () => {
    const res = await getOrder(get(`/api/orders/${ORDER}`), { params: Promise.resolve({ orderId: ORDER }) });
    const { order } = await res.json();
    expect(order).toMatchObject({ id: ORDER, beacon_id: SOON, order_state: 'paid', ticket_count: 5, platform_fee_amount: 0 });
    expect(order).not.toHaveProperty('buyer_user_id');
    expect(order).not.toHaveProperty('ticket_order_items');

    mockGetUser.mockResolvedValue({ user: { id: SOMEONE }, authError: null });
    expect((await getOrder(get(`/api/orders/${ORDER}`), { params: Promise.resolve({ orderId: ORDER }) })).status).toBe(404);
  });
});

describe('ticket wallet while sales are off', () => {
  beforeEach(() => {
    process.env.TICKETING_ENABLED = 'false';
  });

  it('keeps a ticket holder\'s wallet and passes open', async () => {
    const wallet = await getMyTickets(get('/api/me/tickets'));
    expect(wallet.status).toBe(200);
    expect((await wallet.json()).groups.length).toBeGreaterThan(0);
    const one = await getTicket(get(`/api/tickets/${T_VALID}`), { params: Promise.resolve({ ticketId: T_VALID }) });
    expect(one.status).toBe(200);
    const event = await getEventTickets(get(`/api/beacons/${SOON}/tickets`), { params: Promise.resolve({ beaconId: SOON }) });
    expect(event.status).toBe(200);
  });

  it('stays dark for someone without tickets', async () => {
    mockGetUser.mockResolvedValue({ user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, authError: null });
    const res = await getMyTickets(get('/api/me/tickets'));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ticketing_disabled');
  });

  it('reports wallet and sales separately in features', async () => {
    const holder = (await (await getFeatures(get('/api/me/features'))).json()).features;
    expect(holder.ticket_sales.enabled).toBe(false);
    expect(holder.ticket_wallet.enabled).toBe(true);

    mockGetUser.mockResolvedValue({ user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }, authError: null });
    const stranger = (await (await getFeatures(get('/api/me/features'))).json()).features;
    expect(stranger.ticket_wallet.enabled).toBe(false);

    process.env.TICKETING_ENABLED = 'true';
    const open = (await (await getFeatures(get('/api/me/features'))).json()).features;
    expect(open.ticket_sales.enabled).toBe(true);
    expect(open.ticket_wallet.enabled).toBe(true);
  });
});
