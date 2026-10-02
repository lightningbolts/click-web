/** @jest-environment node */
import { createTicketCheckout } from '@/lib/server/ticketing/checkout';
import { requestTicketRefund } from '@/lib/server/ticketing/refunds';
import type { OrderRow } from '@/lib/server/ticketing/fulfillment';
import type { SupabaseClient } from '@supabase/supabase-js';
const mockStripe = {
  checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
  refunds: { create: jest.fn(), retrieve: jest.fn() },
};
jest.mock('@/lib/server/stripe', () => ({
  getStripe: () => mockStripe,
  getAppBaseUrl: () => 'https://click.example',
}));
jest.mock('@/lib/server/ticketing/access', () => ({ mayViewTicketing: async () => true }));
jest.mock('@/lib/server/ticketing/refundFees', () => ({ syncRefundedFees: async () => {} }));
const buyer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  event = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  tier = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
function chain(data: unknown) {
  const q: Record<string, jest.Mock> = {};
  for (const name of ['select', 'eq', 'is', 'in', 'order', 'update']) q[name] = jest.fn(() => q);
  q.single = jest.fn(async () => ({ data, error: null }));
  q.maybeSingle = q.single;
  q.then = jest.fn((resolve) => Promise.resolve({ data, error: null }).then(resolve));
  return q;
}
beforeEach(() => jest.clearAllMocks());
test('checkout retry reuses frozen Stripe parameters despite later price edits', async () => {
  const request = {
    mode: 'payment',
    expires_at: 2000000000,
    line_items: [
      {
        quantity: 1,
        price_data: { currency: 'usd', unit_amount: 1000, product_data: { name: 'Original name' } },
      },
    ],
  };
  const order = {
    id,
    order_state: 'reserved',
    currency: 'usd',
    platform_fee_amount: 100,
    created_at: new Date().toISOString(),
    checkout_expires_at: new Date(Date.now() + 35 * 60000).toISOString(),
    checkout_request: request,
  };
  const rpc = jest.fn(async (name: string) => ({
    data: { ok: true, order_id: id },
    error: null,
    name,
  }));
  const admin = {
    rpc,
    from: (table: string) =>
      chain(
        table === 'ticket_tiers'
          ? [{ id: tier, beacon_id: event, name: 'New name', unit_amount: 2000, currency: 'usd' }]
          : table === 'ticket_orders'
            ? order
            : table === 'ticket_order_items'
              ? [{ quantity: 1, unit_amount: 1000, tier_name_snapshot: 'Original name' }]
              : { organizer_payment_accounts: { stripe_account_id: 'acct_host' } },
      ),
  } as unknown as SupabaseClient;
  mockStripe.checkout.sessions.create.mockResolvedValue({
    id: 'cs',
    url: 'https://checkout.stripe.com/cs',
  });
  await createTicketCheckout(admin, buyer, event, [{ tierId: tier, quantity: 1 }], id);
  await createTicketCheckout(admin, buyer, event, [{ tierId: tier, quantity: 1 }], id);
  expect(mockStripe.checkout.sessions.create).toHaveBeenNthCalledWith(1, request, {
    idempotencyKey: 'checkout-order:' + id,
  });
  expect(mockStripe.checkout.sessions.create).toHaveBeenNthCalledWith(2, request, {
    idempotencyKey: 'checkout-order:' + id,
  });
  expect(rpc.mock.calls.every((args) => args[0] === 'ticketing_reserve_order')).toBe(true);
});
test.each([6, 8])(
  '%i-ticket refund has a short durable key and compact metadata',
  async (quantity) => {
    const tickets = Array.from({ length: quantity }, (_, i) => 'ticket-' + i),
      requestId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const claim = {
      id: requestId,
      amount: quantity * 1000,
      ticket_ids: tickets,
      created_at: new Date().toISOString(),
      stripe_refund_id: null,
    };
    const rpc = jest.fn(async (name: string) => ({
      data:
        name === 'ticketing_claim_refund'
          ? { ok: true, refund: claim }
          : { ok: true, refund_id: requestId },
      error: null,
    }));
    const admin = { rpc } as unknown as SupabaseClient;
    mockStripe.refunds.create.mockResolvedValue({
      id: 're',
      amount: claim.amount,
      status: 'pending',
    });
    const result = await requestTicketRefund(
      admin,
      { id, order_state: 'paid', stripe_payment_intent_id: 'pi' } as OrderRow,
      buyer,
      tickets,
      null,
      requestId,
    );
    expect(result.ok).toBe(true);
    const [body, options] = mockStripe.refunds.create.mock.calls[0];
    expect(options.idempotencyKey.length).toBeLessThan(255);
    expect(body.metadata).toEqual({ click_order_id: id, click_refund_request_id: requestId });
    expect(body.reverse_transfer).toBe(true);
    expect(body.refund_application_fee).toBe(true);
    expect(rpc.mock.calls[0][0]).toBe('ticketing_claim_refund');
  },
);
test('overlapping refund conflict never reaches Stripe', async () => {
  const admin = {
    rpc: jest.fn(async () => ({ data: { ok: false, code: 'refund_in_progress' }, error: null })),
  } as unknown as SupabaseClient;
  const result = await requestTicketRefund(admin, { id } as OrderRow, buyer, ['ticket'], null, id);
  expect(result).toMatchObject({ ok: false, code: 'refund_in_progress' });
  expect(mockStripe.refunds.create).not.toHaveBeenCalled();
});
