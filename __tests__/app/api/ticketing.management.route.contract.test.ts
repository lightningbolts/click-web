/** @jest-environment node */
import { NextRequest } from 'next/server';
import { GET as getTiers } from '@/app/api/beacons/[beaconId]/tickets/tiers/route';
import { PATCH as patchTier } from '@/app/api/beacons/[beaconId]/tickets/tiers/[tierId]/route';
import { POST as credential } from '@/app/api/beacons/[beaconId]/tickets/[ticketId]/credential/route';
import { GET as getWallet } from '@/app/api/beacons/[beaconId]/tickets/route';
import { GET as getOrders } from '@/app/api/beacons/[beaconId]/tickets/orders/route';
import { GET as getSummary } from '@/app/api/beacons/[beaconId]/tickets/summary/route';
import { safeTicketingReturnTo } from '@/lib/ticketing/returnTo';

const mockAuth = jest.fn(),
  mockAdmin = jest.fn(),
  mockManager = jest.fn(),
  mockMayView = jest.fn();
jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: (...a: unknown[]) => mockAuth(...a),
}));
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({
  createAdminSupabaseClient: () => mockAdmin(),
}));
jest.mock('@/lib/events/requireEventManager', () => ({
  requireEventManager: (...a: unknown[]) => mockManager(...a),
}));
jest.mock('@/lib/server/ticketing/access', () => ({
  mayViewTicketing: (...a: unknown[]) => mockMayView(...a),
}));
jest.mock('@/lib/server/stripe', () => ({ getAppBaseUrl: () => 'https://click.example' }));
const id = '11111111-1111-4111-8111-111111111111';
const params = () => ({ params: Promise.resolve({ beaconId: id, tierId: id, ticketId: id }) });
function request(path: string, method = 'GET', body?: unknown) {
  return new NextRequest('https://click.example' + path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}
function chain(data: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const name of ['select', 'eq', 'in', 'order', 'range', 'update', 'is'])
    q[name] = jest.fn(() => q);
  q.single = jest.fn(async () => ({ data, error: null }));
  q.maybeSingle = jest.fn(async () => ({ data, error: null }));
  q.then = jest.fn((resolve) =>
    Promise.resolve({ data, error: null, count: Array.isArray(data) ? data.length : 0 }).then(
      resolve,
    ),
  );
  return q;
}
beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  mockAuth.mockResolvedValue({ user: { id }, authError: null });
  mockMayView.mockResolvedValue(true);
});
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

test('anonymous public tier projection omits internal capacity, sold and hold counts', async () => {
  mockAuth.mockResolvedValue({ user: null });
  const q = chain({ admission_type: 'paid', ticketing_status: 'sales_open' });
  mockAdmin.mockReturnValue({
    from: () => q,
    rpc: async () => ({
      data: [
        {
          id,
          name: 'General',
          is_active: true,
          capacity: 100,
          held: 7,
          sold: 10,
          remaining: 83,
          unit_amount: 1000,
        },
      ],
      error: null,
    }),
  });
  const res = await getTiers(request('/api/beacons/' + id + '/tickets/tiers'), params());
  const data = await res.json();
  expect(res.status).toBe(200);
  expect(data.tiers[0]).toMatchObject({ remaining: 83 });
  expect(data.tiers[0]).not.toHaveProperty('capacity');
  expect(data.tiers[0]).not.toHaveProperty('held');
  expect(data.tiers[0]).not.toHaveProperty('sold');
});
test('invite-only tier reads fail before inventory loads', async () => {
  mockMayView.mockResolvedValue(false);
  const rpc = jest.fn();
  mockAdmin.mockReturnValue({ rpc });
  const res = await getTiers(request('/tiers'), params());
  expect(res.status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
test('organizer tier projection requires event management authorization', async () => {
  mockAdmin.mockReturnValue({});
  mockManager.mockResolvedValue({
    ok: false,
    response: Response.json({ error: 'Forbidden' }, { status: 403 }),
  });
  const res = await getTiers(request('/tiers?view=organizer'), params());
  expect(res.status).toBe(403);
});
test('capacity patch uses guarded transaction and exposes stable conflict code', async () => {
  const rpc = jest
    .fn()
    .mockResolvedValue({ data: { ok: false, code: 'capacity_below_committed' } });
  mockManager.mockResolvedValue({ ok: true, admin: { rpc } });
  const res = await patchTier(request('/tier', 'PATCH', { capacity: 0 }), params());
  expect(res.status).toBe(409);
  expect(rpc).toHaveBeenCalledWith('ticketing_patch_tier', {
    p_beacon: id,
    p_tier: id,
    p_patch: { capacity: 0 },
  });
});
test('credential issuance requires a successful atomic valid-owner update', async () => {
  const q = chain(null);
  mockAdmin.mockReturnValue({ from: () => q });
  const res = await credential(request('/credential', 'POST', {}), params());
  expect(res.status).toBe(409);
  expect(await res.json()).not.toHaveProperty('credential_url');
  expect(q.eq).toHaveBeenCalledWith('owner_user_id', id);
  expect(q.eq).toHaveBeenCalledWith('status', 'valid');
});
test('credential is returned only after updated row is confirmed', async () => {
  const q = chain({ id });
  mockAdmin.mockReturnValue({ from: () => q });
  const res = await credential(request('/credential', 'POST', {}), params());
  expect(res.status).toBe(200);
  expect((await res.json()).credential_url).toContain('/t/');
  expect(res.headers.get('cache-control')).toBe('no-store');
});
test('wallet GET remains read-only even with legacy include_credential query', async () => {
  const q = chain([
    { id, status: 'valid', ticket_number: 'ABC', ticket_tiers: { name: 'General' } },
  ]);
  mockAdmin.mockReturnValue({ from: () => q });
  const res = await getWallet(request('/wallet?include_credential=1'), params());
  expect(res.status).toBe(200);
  expect(q.update).not.toHaveBeenCalled();
  expect((await res.json()).tickets[0]).not.toHaveProperty('credential_url');
});
test('orders list selects only organizer-safe financial fields', async () => {
  const orders = chain([{ id, buyer_user_id: id, total_amount: 1000 }]);
  const buyers = chain([{ id, name: 'Buyer', image: null }]);
  mockManager.mockResolvedValue({
    ok: true,
    admin: { from: (table: string) => (table === 'users' ? buyers : orders) },
  });
  const res = await getOrders(request('/orders?page=0'), params());
  const body = await res.json();
  expect(body.orders[0].buyer.name).toBe('Buyer');
  expect(body.orders[0]).not.toHaveProperty('buyer_user_id');
  expect(orders.select.mock.calls[0][0]).not.toContain('stripe_');
  expect(orders.range).toHaveBeenCalledWith(0, 24);
});
test('summary is a server aggregate', async () => {
  const rpc = jest
    .fn()
    .mockResolvedValue({ data: { gross: 10000, platform_fee: 1000, refunded: 0 }, error: null });
  mockManager.mockResolvedValue({ ok: true, admin: { rpc } });
  const res = await getSummary(request('/summary'), params());
  expect((await res.json()).net_before_stripe_fees).toBe(9000);
  expect(rpc).toHaveBeenCalledWith('ticketing_sales_summary', { p_beacon: id });
});
test.each([
  'https://evil.example',
  '//evil.example',
  '/\\evil.example',
  '/e/' + id + '/manage?next=https://evil.example',
])('Connect rejects return_to %s', (value) => {
  expect(safeTicketingReturnTo(value)).toBe('/events');
});
test('Connect accepts only internal event management paths', () => {
  expect(safeTicketingReturnTo('/e/' + id + '/manage#ticketing')).toBe(
    '/e/' + id + '/manage#ticketing',
  );
});
test('disabled routes stop before any authentication or database work', async () => {
  process.env.TICKETING_ENABLED = 'false';
  for (const handler of [getTiers, getOrders, getSummary, getWallet]) {
    const res = await handler(request('/disabled'), params());
    expect(res.status).toBe(403);
  }
  expect(mockAdmin).not.toHaveBeenCalled();
  expect(mockManager).not.toHaveBeenCalled();
});
