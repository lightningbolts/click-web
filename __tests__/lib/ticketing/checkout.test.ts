/**
 * @jest-environment node
 */
import { FakeDb } from '@/__tests__/helpers/fakeSupabase';

jest.mock('server-only', () => ({}));

const mockSessionsCreate = jest.fn();
const mockRevalidate = jest.fn();

jest.mock('@/lib/server/stripe', () => ({
  getStripe: () => ({ checkout: { sessions: { create: (...args: unknown[]) => mockSessionsCreate(...args) } } }),
  getAppBaseUrl: () => 'https://joinclick.co',
}));
jest.mock('@/lib/server/runtimeEnv', () => ({
  runtimeEnv: (name: string) => (name === 'EVENT_PASS_SECRET' ? 'test-pass-secret' : undefined),
}));
jest.mock('@/lib/server/events/revalidatePublicEvents', () => ({
  revalidatePublicEvents: (...args: unknown[]) => mockRevalidate(...args),
}));

import { createTicketCheckout } from '@/lib/server/ticketing/checkout';
import { hashTicketToken } from '@/lib/server/ticketing/credentials';
import { mintTicketToken } from '@/lib/events/eventPass';

const EVENT = '11111111-1111-4111-8111-111111111111';
const BUYER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FREE = '33333333-3333-4333-8333-333333333331';
const PAID = '33333333-3333-4333-8333-333333333332';
const ORDER = '22222222-2222-4222-8222-222222222222';
const KEY = Buffer.from('test-pass-secret', 'utf8');

let db: FakeDb;
function world(claim: unknown = { ok: true, order_id: ORDER, ticket_ids: [] }) {
  db = new FakeDb({
    tables: {
      ticket_tiers: [
        { id: FREE, beacon_id: EVENT, name: 'Free', currency: 'usd', unit_amount: 0 },
        { id: PAID, beacon_id: EVENT, name: 'GA', currency: 'usd', unit_amount: 1500 },
      ],
      map_beacons: [{ id: EVENT, organizer_payment_account_id: 'acct', organizer_payment_accounts: { stripe_account_id: 'acct_x' } }],
      ticket_orders: [{ id: ORDER, order_state: 'reserved' }],
    },
    rpc: {
      ticketing_claim_free: () => claim,
      ticketing_reserve_order: () => ({ ok: true, order_id: ORDER }),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  world();
  mockSessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });
});

describe('createTicketCheckout', () => {
  it('claims free tickets without Stripe', async () => {
    const result = await createTicketCheckout(db.client as never, BUYER, EVENT, [{ tierId: FREE, quantity: 2 }]);
    expect(result).toEqual({ ok: true, orderId: ORDER, fulfilled: true });
    expect(mockSessionsCreate).not.toHaveBeenCalled();

    const call = db.log.find((entry) => entry.table === 'rpc:ticketing_claim_free')!;
    const args = call.payload as { p_items: unknown[]; p_tickets: { id: string; tier_id: string; ordinal: number; token_hash: string }[] };
    expect(args.p_items).toEqual([{ tier_id: FREE, quantity: 2, expected_unit_amount: 0 }]);
    expect(args.p_tickets.map((t) => [t.tier_id, t.ordinal])).toEqual([[FREE, 1], [FREE, 2]]);
    for (const ticket of args.p_tickets) {
      expect(ticket.token_hash).toBe(hashTicketToken(mintTicketToken(KEY, EVENT, ticket.id)));
    }
    expect(mockRevalidate).toHaveBeenCalledWith(EVENT);
  });

  it('refuses to mix free and paid tickets in one order', async () => {
    const result = await createTicketCheckout(db.client as never, BUYER, EVENT, [
      { tierId: FREE, quantity: 1 },
      { tierId: PAID, quantity: 1 },
    ]);
    expect(result).toEqual({ ok: false, status: 400, code: 'mixed_order' });
  });

  it('passes free-claim refusals through with the remaining count', async () => {
    world({ ok: false, code: 'insufficient_inventory', remaining: 1 });
    const result = await createTicketCheckout(db.client as never, BUYER, EVENT, [{ tierId: FREE, quantity: 2 }]);
    expect(result).toEqual({ ok: false, status: 409, code: 'insufficient_inventory', extra: { remaining: 1 } });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('returns buyers to the event return page after Stripe', async () => {
    const result = await createTicketCheckout(db.client as never, BUYER, EVENT, [{ tierId: PAID, quantity: 1 }], { client: 'ios' });
    expect(result).toEqual({ ok: true, orderId: ORDER, checkoutUrl: 'https://checkout.stripe.com/cs_1' });
    const [params] = mockSessionsCreate.mock.calls[0]!;
    expect(params.success_url).toBe(`https://joinclick.co/e/${EVENT}/tickets/return?order=${ORDER}`);
    expect(params.cancel_url).toBe(`https://joinclick.co/e/${EVENT}/tickets/return?order=${ORDER}&canceled=1`);
    expect(params.metadata).toEqual({ click_order_id: ORDER, click_event_id: EVENT, click_client: 'ios' });
  });
});
