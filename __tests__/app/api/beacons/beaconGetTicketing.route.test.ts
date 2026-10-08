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
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => db.client,
}));
jest.mock('@/lib/server/eventHubLifecycle', () => ({
  findHubForEventBeacon: async () => null,
  syncEventHubFromBeacon: async () => undefined,
}));
jest.mock('@/lib/server/places/placeRefs', () => ({
  withPlaceRefs: async (_admin: unknown, beacons: unknown[]) => beacons,
}));

import { GET } from '@/app/api/beacons/[beaconId]/route';

const EVENT = '11111111-1111-4111-8111-111111111111';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function beaconRow(admission: 'rsvp' | 'ticketed', beaconType = 'event') {
  return {
    id: EVENT,
    creator_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    venue_id: null,
    hub_id: null,
    beacon_type: beaconType,
    show_creator_name: false,
    metadata: { title: 'Jazz night' },
    created_at: '2026-10-01T00:00:00Z',
    expires_at: '2030-01-01T00:00:00Z',
    location: { type: 'Point', coordinates: [-122.3, 47.65] },
    admission_type: admission,
    ticketing_status: 'sales_open',
    ticket_sales_start_at: null,
    ticket_sales_end_at: null,
    event_cancelled_at: null,
  };
}

function world(admission: 'rsvp' | 'ticketed') {
  db = new FakeDb({
    tables: {
      map_beacons: [beaconRow(admission)],
      ticket_tiers: [
        { id: 't1', beacon_id: EVENT, name: 'GA', description: null, unit_amount: 1500, currency: 'usd', capacity: 10, max_per_order: 8, max_per_user: null, sales_start_at: null, sales_end_at: null, sort_order: 0, is_active: true, archived_at: null },
      ],
      tickets: [
        { id: 'k1', beacon_id: EVENT, owner_user_id: ME, ticket_tier_id: 't1', status: 'valid' },
        { id: 'k2', beacon_id: EVENT, owner_user_id: ME, ticket_tier_id: 't1', status: 'checked_in' },
        { id: 'k3', beacon_id: EVENT, owner_user_id: ME, ticket_tier_id: 't1', status: 'refunded' },
      ],
    },
    rpc: { ticketing_tier_counts: () => [{ tier_id: 't1', sold: 2, held: 0, checked_in: 1 }] },
  });
}

const get = () =>
  GET(new NextRequest(`https://click.example/api/beacons/${EVENT}`), { params: Promise.resolve({ beaconId: EVENT }) });

describe('GET /api/beacons/:id ticketing', () => {
  const ORIGINAL = process.env.TICKETING_ENABLED;
  beforeEach(() => {
    process.env.TICKETING_ENABLED = 'true';
    mockGetUser.mockResolvedValue({ user: { id: ME }, authError: null });
  });
  afterAll(() => {
    process.env.TICKETING_ENABLED = ORIGINAL;
  });

  it("includes the summary and the caller's live ticket count", async () => {
    world('ticketed');
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.beacon.ticketing).toEqual({
      status: 'sales_open',
      cancelled: false,
      from_amount: 1500,
      currency: 'usd',
      available: true,
      my_ticket_count: 2,
    });
  });

  it('is null for RSVP events', async () => {
    world('rsvp');
    const body = await (await get()).json();
    expect(body.beacon.ticketing).toBeNull();
  });
});
