/** @jest-environment node */
import { reconcileSession, TicketingAttentionError } from '@/lib/server/ticketing/reconcile';
import { markTicketingWebhookOutcome } from '@/lib/server/ticketing/webhookLedger';
import type { SupabaseClient } from '@supabase/supabase-js';
const mockStripe = {
  checkout: { sessions: { retrieve: jest.fn() } },
  paymentIntents: { retrieve: jest.fn(), cancel: jest.fn() },
};
const mockOrder = jest.fn(),
  mockFulfill = jest.fn();
jest.mock('@/lib/server/stripe', () => ({ getStripe: () => mockStripe }));
jest.mock('@/lib/server/ticketing/fulfillment', () => ({
  loadOrder: (...a: unknown[]) => mockOrder(...a),
  fulfillFromCheckoutSession: (...a: unknown[]) => mockFulfill(...a),
}));
const rpc = jest.fn();
const admin = { rpc } as unknown as SupabaseClient;

test('ledger write failure propagates so the webhook can retry', async () => {
  const db={from:()=>({update:()=>({eq:async()=>({error:{message:'database unavailable'}})})})} as unknown as SupabaseClient;
  await expect(markTicketingWebhookOutcome(db,'evt','needs_attention','amount_mismatch')).rejects.toThrow('database unavailable');
});
beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.mockResolvedValue({ id: 'order', stripe_checkout_session_id: 'cs' });
  mockFulfill.mockResolvedValue({ ok: true });
  rpc.mockResolvedValue({ data: { ok: true } });
});
test('expired delivery after payment completion uses current Stripe truth and fulfills', async () => {
  mockStripe.checkout.sessions.retrieve.mockResolvedValue({
    id: 'cs',
    metadata: { click_order_id: 'order' },
    payment_status: 'paid',
    status: 'complete',
  });
  expect(await reconcileSession(admin, 'cs')).toBe('processed');
  expect(mockFulfill).toHaveBeenCalledTimes(1);
  expect(rpc).not.toHaveBeenCalled();
});
test('expired session with processing payment retains inventory', async () => {
  mockStripe.checkout.sessions.retrieve.mockResolvedValue({
    id: 'cs',
    metadata: { click_order_id: 'order' },
    payment_status: 'unpaid',
    status: 'expired',
    payment_intent: 'pi',
  });
  mockStripe.paymentIntents.retrieve.mockResolvedValue({ status: 'processing' });
  expect(await reconcileSession(admin, 'cs')).toBe('ignored');
  expect(rpc).not.toHaveBeenCalled();
});
test('release requires authoritative expiration and canceled intent', async () => {
  mockStripe.checkout.sessions.retrieve.mockResolvedValue({
    id: 'cs',
    metadata: { click_order_id: 'order' },
    payment_status: 'unpaid',
    status: 'expired',
    payment_intent: 'pi',
  });
  mockStripe.paymentIntents.retrieve.mockResolvedValue({ status: 'requires_payment_method' });
  mockStripe.paymentIntents.cancel.mockResolvedValue({ status: 'canceled' });
  await reconcileSession(admin, 'cs');
  expect(rpc).toHaveBeenCalledWith('ticketing_cancel_order', {
    p_order: 'order',
    p_target_state: 'expired',
  });
});
test('hard financial mismatch becomes operator attention, not a successful return', async () => {
  mockStripe.checkout.sessions.retrieve.mockResolvedValue({
    id: 'cs',
    metadata: { click_order_id: 'order' },
    payment_status: 'paid',
  });
  mockFulfill.mockResolvedValue({ ok: false, code: 'amount_mismatch' });
  await expect(reconcileSession(admin, 'cs')).rejects.toThrow(TicketingAttentionError);
  expect(rpc).not.toHaveBeenCalled();
});
test('ledger persists needs_attention without marking processed_at', async () => {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq }));
  const db = { from: () => ({ update }) } as unknown as SupabaseClient;
  await markTicketingWebhookOutcome(db, 'evt', 'needs_attention', 'amount_mismatch');
  expect(update).toHaveBeenCalledWith({
    processing_state: 'needs_attention',
    last_error: 'amount_mismatch',
    processed_at: null,
  });
});
