/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockRequireEventManager = jest.fn();
const mockRefund = jest.fn();
const mockRevalidate = jest.fn();
let db: FakeDb;

jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => db.client }));
jest.mock('@/lib/server/supabaseRouteAuth', () => ({
  getSupabaseFromRouteRequest: async () => ({ user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, authError: null }),
}));
jest.mock('@/lib/events/requireEventManager', () => ({
  requireEventManager: (...args: unknown[]) => mockRequireEventManager(...args),
}));
jest.mock('@/lib/server/ticketing/refunds', () => ({
  requestTicketRefund: (...args: unknown[]) => mockRefund(...args),
}));
jest.mock('@/lib/server/events/revalidatePublicEvents', () => ({
  revalidatePublicEvents: (...args: unknown[]) => mockRevalidate(...args),
}));

import { POST } from '@/app/api/orders/[orderId]/refunds/route';

const EVENT = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TICKETING_ENABLED = 'true';
  db = new FakeDb({ tables: { ticket_orders: [{ id: ORDER, beacon_id: EVENT, order_state: 'paid', buyer_user_id: 'b' }] } });
  mockRequireEventManager.mockResolvedValue({ ok: true, admin: db.client, userId: 'h', beacon: { id: EVENT }, access: 'manage' });
  mockRefund.mockResolvedValue({ ok: true, refundId: 'r', stripeRefundId: 're', amount: 1500 });
});
afterAll(() => {
  delete process.env.TICKETING_ENABLED;
});

it('a refund frees its ticket on the event page', async () => {
  const res = await POST(
    new NextRequest(`https://click.example/api/orders/${ORDER}/refunds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticket_ids: ['44444444-4444-4444-8444-444444444441'] }),
    }),
    { params: Promise.resolve({ orderId: ORDER }) },
  );
  expect(res.status).toBe(201);
  expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
});
