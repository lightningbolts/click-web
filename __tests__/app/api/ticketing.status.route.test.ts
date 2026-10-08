/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockRequireEventManager = jest.fn();
const mockRevalidate = jest.fn();
const mockLoadAccount = jest.fn();
let db: FakeDb;

jest.mock('@/lib/events/requireEventManager', () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));
jest.mock('@/lib/server/events/revalidatePublicEvents', () => ({
  revalidatePublicEvents: (...args: unknown[]) => mockRevalidate(...args),
}));
jest.mock('@/lib/server/ticketing/connect', () => ({
  loadOrganizerAccount: (...args: unknown[]) => mockLoadAccount(...args),
}));

import { POST } from '@/app/api/beacons/[beaconId]/tickets/status/route';

const EVENT = '11111111-1111-4111-8111-111111111111';
const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const READY = { id: 'acct-1', onboarding_state: 'ready', transfers_enabled: true };

function world(opts: { prices?: number[]; tickets?: number; cancelled?: boolean } = {}) {
  db = new FakeDb({
    tables: {
      map_beacons: [
        { id: EVENT, beacon_type: 'event', admission_type: 'ticketed', ticketing_status: 'draft', event_cancelled_at: opts.cancelled ? '2026-10-01T00:00:00Z' : null },
      ],
      ticket_tiers: (opts.prices ?? [0]).map((unit_amount, i) => ({
        id: `t${i}`,
        beacon_id: EVENT,
        unit_amount,
        is_active: true,
        archived_at: null,
      })),
      tickets: Array.from({ length: opts.tickets ?? 0 }, (_, i) => ({ id: `k${i}`, beacon_id: EVENT })),
    },
  });
  mockRequireEventManager.mockResolvedValue({ ok: true, admin: db.client, userId: HOST, beacon: { id: EVENT, creator_id: HOST }, access: 'manage' });
}

const post = (ticketing_status: string) =>
  POST(
    new NextRequest(`https://click.example/api/beacons/${EVENT}/tickets/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticketing_status }),
    }),
    { params: Promise.resolve({ beaconId: EVENT }) },
  );
const event = () => db.rows('map_beacons')[0]!;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  mockLoadAccount.mockResolvedValue(null);
});
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

describe('POST /api/beacons/:id/tickets/status', () => {
  it('opens free-only sales without a payout account', async () => {
    world({ prices: [0] });
    const res = await post('sales_open');
    expect(res.status).toBe(200);
    expect(event()).toMatchObject({ ticketing_status: 'sales_open', admission_type: 'ticketed' });
    expect(event().organizer_payment_account_id).toBeUndefined();
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
  });

  it('needs payouts before selling paid tickets', async () => {
    world({ prices: [0, 1500] });
    const res = await post('sales_open');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('organizer_not_ready');
    expect(event().ticketing_status).toBe('draft');

    mockLoadAccount.mockResolvedValue(READY);
    expect((await post('sales_open')).status).toBe(200);
    expect(event()).toMatchObject({ ticketing_status: 'sales_open', organizer_payment_account_id: 'acct-1' });
  });

  it("a co-host opening paid sales pays out to the creator, not to themselves", async () => {
    world({ prices: [1500] });
    mockRequireEventManager.mockResolvedValue({
      ok: true, admin: db.client, userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', beacon: { id: EVENT, creator_id: HOST }, access: 'manage',
    });
    mockLoadAccount.mockResolvedValue(READY);
    expect((await post('sales_open')).status).toBe(200);
    expect(mockLoadAccount).toHaveBeenCalledWith(expect.anything(), HOST);
  });

  it('needs at least one active tier to open', async () => {
    world({ prices: [] });
    const res = await post('sales_open');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('no_active_tiers');
  });

  it('turns ticketing off only before any ticket is issued', async () => {
    world({ tickets: 1 });
    const blocked = await post('disabled');
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).code).toBe('tickets_issued');

    world({ tickets: 0 });
    expect((await post('disabled')).status).toBe(200);
    expect(event()).toMatchObject({ ticketing_status: 'disabled', admission_type: 'rsvp' });
  });

  it('refuses changes once the event is cancelled', async () => {
    world({ cancelled: true });
    const res = await post('sales_open');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('event_cancelled');
  });
});
