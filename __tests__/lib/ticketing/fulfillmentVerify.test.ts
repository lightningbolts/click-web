/**
 * @jest-environment node
 */
import { verifyIntentAgainstOrder } from '@/lib/server/ticketing/fulfillment';

const order = {
  id: 'order-1',
  total_amount: 5000,
  currency: 'usd',
  platform_fee_amount: 250,
};

function intent(overrides: Record<string, unknown> = {}) {
  return {
    status: 'succeeded',
    amount: 5000,
    currency: 'usd',
    transfer_data: { destination: 'acct_123' },
    application_fee_amount: 250,
    metadata: { click_order_id: 'order-1' },
    ...overrides,
  } as Parameters<typeof verifyIntentAgainstOrder>[0];
}

describe('verifyIntentAgainstOrder', () => {
  it('passes when every financial field matches the order snapshot', () => {
    expect(verifyIntentAgainstOrder(intent(), order)).toBeNull();
  });

  it('rejects a non-succeeded intent', () => {
    expect(verifyIntentAgainstOrder(intent({ status: 'processing' }), order)).toBe(
      'intent_not_succeeded',
    );
  });

  it('rejects amount and currency drift', () => {
    expect(verifyIntentAgainstOrder(intent({ amount: 4999 }), order)).toBe('amount_mismatch');
    expect(verifyIntentAgainstOrder(intent({ currency: 'eur' }), order)).toBe('currency_mismatch');
  });

  it('rejects application-fee drift', () => {
    expect(verifyIntentAgainstOrder(intent({ application_fee_amount: 0 }), order)).toBe(
      'application_fee_mismatch',
    );
    expect(verifyIntentAgainstOrder(intent({ application_fee_amount: null }), { ...order, platform_fee_amount: 0 })).toBeNull();
  });

  it('rejects an intent pointing at a different Click order', () => {
    expect(
      verifyIntentAgainstOrder(intent({ metadata: { click_order_id: 'other' } }), order),
    ).toBe('order_reference_mismatch');
  });
});
