/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockGetUser = jest.fn();
const mockRequireEventManager = jest.fn();
const mockRevalidate = jest.fn();
let db: FakeDb;

jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...args: unknown[]) => mockGetUser(...args),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => db.client }));
jest.mock('@/lib/events/requireEventManager', () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));
jest.mock('@/lib/server/events/revalidatePublicEvents', () => ({
  revalidatePublicEvents: (...args: unknown[]) => mockRevalidate(...args),
}));

import { GET, POST } from '@/app/api/beacons/[beaconId]/tickets/tiers/route';
import { DELETE, PATCH } from '@/app/api/beacons/[beaconId]/tickets/tiers/[tierId]/route';

const EVENT = '11111111-1111-4111-8111-111111111111';
const OTHER_EVENT = '99999999-9999-4999-8999-999999999999';
const TIER = '33333333-3333-4333-8333-333333333333';
const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const tierRow = (over: Record<string, unknown> = {}) => ({
  id: TIER,
  beacon_id: EVENT,
  name: 'GA',
  description: null,
  unit_amount: 1500,
  currency: 'usd',
  capacity: 50,
  max_per_order: 8,
  max_per_user: null,
  sales_start_at: null,
  sales_end_at: null,
  sort_order: 0,
  is_active: true,
  archived_at: null,
  ...over,
});

function world(opts: { admission?: string; cancelled?: boolean; tiers?: Record<string, unknown>[]; orderItems?: boolean; updateTier?: unknown } = {}) {
  db = new FakeDb({
    tables: {
      map_beacons: [
        {
          id: EVENT,
          beacon_type: 'event',
          admission_type: opts.admission ?? 'ticketed',
          ticketing_status: opts.admission === 'rsvp' ? 'disabled' : 'sales_open',
          ticket_sales_start_at: null,
          ticket_sales_end_at: null,
          event_cancelled_at: opts.cancelled ? '2026-10-01T00:00:00Z' : null,
        },
      ],
      ticket_tiers: opts.tiers ?? [tierRow()],
      ticket_order_items: opts.orderItems ? [{ id: 'oi1', order_id: 'o1', ticket_tier_id: TIER }] : [],
      tickets: [],
    },
    rpc: {
      ticketing_tier_counts: () => [{ tier_id: TIER, sold: 4, held: 1, checked_in: 2 }],
      ticketing_update_tier: () => opts.updateTier ?? { ok: true },
    },
  });
  mockRequireEventManager.mockResolvedValue({ ok: true, admin: db.client, userId: HOST, beacon: { id: EVENT }, access: 'manage' });
}

const json = (method: string, url: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const base = `https://click.example/api/beacons/${EVENT}/tickets/tiers`;
const params = { params: Promise.resolve({ beaconId: EVENT }) };
const tierParams = (tierId = TIER) => ({ params: Promise.resolve({ beaconId: EVENT, tierId }) });
const newTier = { name: 'VIP', unit_amount: 4000, capacity: 20 };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  mockGetUser.mockResolvedValue({ user: null, authError: null });
  world();
});
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

describe('ticket tier routes', () => {
  it('are gated by the rollout flag', async () => {
    process.env.TICKETING_ENABLED = 'false';
    expect((await GET(json('GET', base), params)).status).toBe(403);
    expect((await POST(json('POST', base, newTier), params)).status).toBe(403);
    expect((await PATCH(json('PATCH', `${base}/${TIER}`, { name: 'x' }), tierParams())).status).toBe(403);
    expect((await DELETE(json('DELETE', `${base}/${TIER}`), tierParams())).status).toBe(403);
  });

  it('shows offerings to signed-out visitors', async () => {
    const res = await GET(json('GET', base), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tiers).toEqual([
      expect.objectContaining({ id: TIER, name: 'GA', unit_amount: 1500, availability: 'on_sale', max_quantity: 8 }),
    ]);
    expect(body.tiers[0]).not.toHaveProperty('sold');
  });

  it('404s for an unknown event', async () => {
    const res = await GET(json('GET', base), { params: Promise.resolve({ beaconId: OTHER_EVENT }) });
    expect(res.status).toBe(404);
  });

  it('shows counts to managers and refuses everyone else', async () => {
    const managed = await (await GET(json('GET', `${base}?manage=1`), params)).json();
    expect(managed.tiers[0]).toEqual(expect.objectContaining({ sold: 4, held: 1, checked_in: 2, capacity: 50 }));
    expect(mockRequireEventManager).toHaveBeenCalledWith(expect.anything(), EVENT, { allowViewers: true });

    mockRequireEventManager.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await GET(json('GET', `${base}?manage=1`), params)).status).toBe(403);
  });

  it('turns an RSVP event into a ticketed draft on its first tier', async () => {
    world({ admission: 'rsvp', tiers: [] });
    const res = await POST(json('POST', base, newTier), params);
    expect(res.status).toBe(201);
    expect(db.rows('map_beacons')[0]).toMatchObject({ admission_type: 'ticketed', ticketing_status: 'draft' });
    expect(db.rows('ticket_tiers')).toHaveLength(1);
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
  });

  it('rejects an inverted sales window and cancelled events', async () => {
    const inverted = await POST(
      json('POST', base, { ...newTier, sales_start_at: '2030-01-02T00:00:00Z', sales_end_at: '2030-01-01T00:00:00Z' }),
      params,
    );
    expect(inverted.status).toBe(400);
    expect((await inverted.json()).code).toBe('invalid_window');

    world({ cancelled: true });
    const cancelled = await POST(json('POST', base, newTier), params);
    expect(cancelled.status).toBe(409);
    expect((await cancelled.json()).code).toBe('event_cancelled');
  });

  it('passes edit refusals through as 409s', async () => {
    world({ updateTier: { ok: false, code: 'capacity_below_sold', sold: 5 } });
    const res = await PATCH(json('PATCH', `${base}/${TIER}`, { capacity: 2 }), tierParams());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'capacity_below_sold', sold: 5 });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('applies edits and revalidates the event', async () => {
    const res = await PATCH(json('PATCH', `${base}/${TIER}`, { name: 'General', is_active: false }), tierParams());
    expect(res.status).toBe(200);
    expect(db.log).toContainEqual(
      expect.objectContaining({ table: 'rpc:ticketing_update_tier', payload: { p_tier: TIER, p_patch: { name: 'General', is_active: false } } }),
    );
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
  });

  it("404s for another event's tier", async () => {
    world({ tiers: [tierRow({ beacon_id: OTHER_EVENT })] });
    expect((await PATCH(json('PATCH', `${base}/${TIER}`, { name: 'x' }), tierParams())).status).toBe(404);
    expect((await DELETE(json('DELETE', `${base}/${TIER}`), tierParams())).status).toBe(404);
  });

  it('archives tiers with orders and removes tiers without', async () => {
    world({ orderItems: true });
    const archived = await (await DELETE(json('DELETE', `${base}/${TIER}`), tierParams())).json();
    expect(archived).toEqual({ deleted: 'archived' });
    expect(db.rows('ticket_tiers')[0]).toMatchObject({ is_active: false });
    expect(db.rows('ticket_tiers')[0]!.archived_at).toEqual(expect.any(String));

    world();
    const removed = await (await DELETE(json('DELETE', `${base}/${TIER}`), tierParams())).json();
    expect(removed).toEqual({ deleted: 'removed' });
    expect(db.rows('ticket_tiers')).toHaveLength(0);
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
  });
});
