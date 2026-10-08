/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockRequireEventManager = jest.fn();
let db: FakeDb;
let attendeeRows: Record<string, unknown>[] = [];

jest.mock('@/lib/events/requireEventManager', () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));

import { GET as getSummary } from '@/app/api/beacons/[beaconId]/tickets/summary/route';
import { GET as getAttendees } from '@/app/api/beacons/[beaconId]/tickets/attendees/route';

const EVENT = '11111111-1111-4111-8111-111111111111';
const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GA = '33333333-3333-4333-8333-333333333331';
const VIP = '33333333-3333-4333-8333-333333333332';
const FREE = '33333333-3333-4333-8333-333333333333';

const tier = (id: string, name: string, unit_amount: number, capacity: number, sort_order: number) => ({
  id,
  beacon_id: EVENT,
  name,
  description: null,
  unit_amount,
  currency: 'usd',
  capacity,
  max_per_order: 8,
  max_per_user: null,
  sales_start_at: null,
  sales_end_at: null,
  sort_order,
  is_active: true,
  archived_at: null,
});
const order = (id: string, total_amount: number, platform_fee_amount: number, refunds: number[] = []) => ({
  id,
  beacon_id: EVENT,
  order_state: refunds.length ? 'partially_refunded' : 'paid',
  currency: 'usd',
  total_amount,
  platform_fee_amount,
  ticket_refunds: refunds.map((amount) => ({ amount, status: 'succeeded' })),
});
const attendee = (n: number, over: Record<string, unknown> = {}) => ({
  ticket_id: `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`,
  order_id: '22222222-2222-4222-8222-222222222222',
  user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  first_name: 'Ada',
  last_name: 'Lovelace',
  display_name: null,
  avatar_url: null,
  tier_name: 'GA',
  paid: true,
  status: 'valid',
  checked_in_at: null,
  ticket_number: `CLK-${n}`,
  issued_at: `2026-10-01T00:00:${String(n % 60).padStart(2, '0')}Z`,
  ...over,
});

function world(access: 'manage' | 'view' = 'manage') {
  db = new FakeDb({
    tables: {
      map_beacons: [
        { id: EVENT, beacon_type: 'event', admission_type: 'ticketed', ticketing_status: 'sales_open', ticket_sales_start_at: null, ticket_sales_end_at: null, event_cancelled_at: null },
      ],
      ticket_tiers: [tier(GA, 'GA', 1500, 100, 0), tier(VIP, 'VIP', 2500, 20, 1), tier(FREE, 'Free', 0, 50, 2)],
      ticket_orders: [
        order('o1', 3000, 150, [1500]),
        order('o2', 2500, 125),
        order('o3', 0, 0),
        { ...order('o4', 9900, 495), order_state: 'expired' },
      ],
    },
    rpc: {
      ticketing_tier_counts: () => [
        { tier_id: GA, sold: 1, held: 0, checked_in: 1 },
        { tier_id: VIP, sold: 1, held: 2, checked_in: 0 },
        { tier_id: FREE, sold: 1, held: 0, checked_in: 0 },
      ],
      ticketing_search_attendees: () => attendeeRows,
    },
  });
  mockRequireEventManager.mockResolvedValue({ ok: true, admin: db.client, userId: HOST, beacon: { id: EVENT }, access });
}

const params = { params: Promise.resolve({ beaconId: EVENT }) };
const get = (path: string) => new NextRequest(`https://click.example/api/beacons/${EVENT}/tickets/${path}`);
const searchArgs = () => db.log.filter((e) => e.table === 'rpc:ticketing_search_attendees').map((e) => e.payload);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  attendeeRows = [attendee(1)];
  world();
});
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

describe('organizer ticketing routes', () => {
  it('summarizes sales net of refunds and the fee Click keeps', async () => {
    const res = await getSummary(get('summary'), params);
    expect(res.status).toBe(200);
    // Gross 3000 + 2500 + 0. Order o1 is half refunded, so Click keeps half its 150 fee.
    expect(await res.json()).toEqual({
      sold: 3,
      capacity: 170,
      checked_in: 1,
      gross_cents: 5500,
      refunded_cents: 1500,
      net_cents: 5500 - 1500 - 75 - 125,
      // o1 (half refunded) and o2 still have money to give back; o3 was free.
      refundable_orders: 2,
      currency: 'usd',
      tiers: [
        { id: GA, name: 'GA', sold: 1, capacity: 100, unit_amount: 1500 },
        { id: VIP, name: 'VIP', sold: 1, capacity: 20, unit_amount: 2500 },
        { id: FREE, name: 'Free', sold: 1, capacity: 50, unit_amount: 0 },
      ],
    });
    expect(mockRequireEventManager).toHaveBeenCalledWith(expect.anything(), EVENT, { allowViewers: true });
  });

  it('refuses people who cannot see the event dashboard', async () => {
    mockRequireEventManager.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await getSummary(get('summary'), params)).status).toBe(403);
    expect((await getAttendees(get('attendees'), params)).status).toBe(403);
  });

  it('lists attendees with names and marks paid live tickets refundable for managers', async () => {
    attendeeRows = [
      attendee(1),
      attendee(2, { paid: false }),
      attendee(3, { status: 'refunded' }),
      attendee(4, { first_name: null, last_name: null, display_name: 'ada.l', status: 'checked_in' }),
      attendee(5, { first_name: null, last_name: null }),
    ];
    const { attendees, next_cursor } = await (await getAttendees(get('attendees'), params)).json();
    expect(attendees.map((a: { name: string; refundable: boolean }) => [a.name, a.refundable])).toEqual([
      ['Ada Lovelace', true],
      ['Ada Lovelace', false],
      ['Ada Lovelace', false],
      ['ada.l', true],
      ['Guest', true],
    ]);
    expect(attendees[0]).toEqual({
      ticket_id: attendeeRows[0]!.ticket_id,
      order_id: attendeeRows[0]!.order_id,
      user_id: attendeeRows[0]!.user_id,
      name: 'Ada Lovelace',
      avatar_url: null,
      tier_name: 'GA',
      status: 'valid',
      checked_in_at: null,
      ticket_number: 'CLK-1',
      refundable: true,
    });
    expect(next_cursor).toBeNull();
  });

  it('never offers refunds to Place viewers', async () => {
    world('view');
    const { attendees } = await (await getAttendees(get('attendees'), params)).json();
    expect(attendees[0].refundable).toBe(false);
  });

  it('searches by name or ticket number', async () => {
    await getAttendees(get('attendees?q=Ada%20Love'), params);
    await getAttendees(get('attendees?q=CLK-7QX2-K9P4M'), params);
    expect(searchArgs().map((a) => (a as { p_query: string }).p_query)).toEqual(['Ada Love', 'CLK-7QX2-K9P4M']);
  });

  it('pages 50 at a time with an opaque cursor', async () => {
    attendeeRows = Array.from({ length: 51 }, (_, i) => attendee(i + 1));
    const first = await (await getAttendees(get('attendees'), params)).json();
    expect(first.attendees).toHaveLength(50);
    expect(first.next_cursor).toEqual(expect.any(String));
    expect(searchArgs()[0]).toMatchObject({ p_after_issued_at: null, p_after_id: null, p_limit: 51 });

    attendeeRows = [attendee(51)];
    const second = await (await getAttendees(get(`attendees?cursor=${first.next_cursor}`), params)).json();
    expect(second.next_cursor).toBeNull();
    expect(searchArgs()[1]).toMatchObject({ p_after_issued_at: attendee(50).issued_at, p_after_id: attendee(50).ticket_id });
  });

  it('rejects a malformed cursor', async () => {
    const res = await getAttendees(get('attendees?cursor=nope'), params);
    expect(res.status).toBe(400);
  });
});
