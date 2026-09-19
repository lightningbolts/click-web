/**
 * @jest-environment node
 */
import {
  CURRENT_FEE_POLICY,
  computePlatformFeeCents,
  isFeePolicy,
  priceOrder,
} from '@/lib/server/ticketing/feePolicy';

describe('computePlatformFeeCents', () => {
  it('applies 5% with half-up rounding', () => {
    // 2500 * 5% = 125
    expect(computePlatformFeeCents(2500, CURRENT_FEE_POLICY)).toBe(125);
    // 1010 * 5% = 50.5 -> 51
    expect(computePlatformFeeCents(1010, CURRENT_FEE_POLICY)).toBe(51);
    // 990 * 5% = 49.5 -> 50
    expect(computePlatformFeeCents(990, CURRENT_FEE_POLICY)).toBe(50);
    // 989 * 5% = 49.45 -> 49
    expect(computePlatformFeeCents(989, CURRENT_FEE_POLICY)).toBe(49);
  });

  it('never charges a fee on a free order', () => {
    expect(computePlatformFeeCents(0, { version: 1, percent_bps: 500, flat_cents: 100 })).toBe(0);
  });

  it('caps the fee at the subtotal', () => {
    expect(computePlatformFeeCents(50, { version: 1, percent_bps: 500, flat_cents: 500 })).toBe(50);
  });

  it('rejects invalid subtotals', () => {
    expect(() => computePlatformFeeCents(-1, CURRENT_FEE_POLICY)).toThrow();
    expect(() => computePlatformFeeCents(10.5, CURRENT_FEE_POLICY)).toThrow();
  });
});

describe('priceOrder', () => {
  it('sums multi-tier items and snapshots the policy', () => {
    const pricing = priceOrder(
      [
        { unitAmountCents: 2500, quantity: 2 },
        { unitAmountCents: 1000, quantity: 1 },
      ],
      CURRENT_FEE_POLICY,
    );
    expect(pricing.subtotalCents).toBe(6000);
    expect(pricing.platformFeeCents).toBe(300);
    // Attendee pays face value; the fee comes out of the organizer transfer.
    expect(pricing.totalCents).toBe(6000);
    expect(pricing.feePolicySnapshot).toEqual(CURRENT_FEE_POLICY);
  });

  it('rejects zero or negative quantities and fractional amounts', () => {
    expect(() => priceOrder([{ unitAmountCents: 100, quantity: 0 }], CURRENT_FEE_POLICY)).toThrow();
    expect(() => priceOrder([{ unitAmountCents: 100, quantity: -2 }], CURRENT_FEE_POLICY)).toThrow();
    expect(() =>
      priceOrder([{ unitAmountCents: 99.5, quantity: 1 }], CURRENT_FEE_POLICY),
    ).toThrow();
  });
});

describe('isFeePolicy', () => {
  it('accepts the current policy and rejects malformed values', () => {
    expect(isFeePolicy(CURRENT_FEE_POLICY)).toBe(true);
    expect(isFeePolicy(null)).toBe(false);
    expect(isFeePolicy({ version: 1, percent_bps: 20000, flat_cents: 0 })).toBe(false);
    expect(isFeePolicy({ version: 1, percent_bps: -1, flat_cents: 0 })).toBe(false);
    expect(isFeePolicy({ version: 1, percent_bps: 500 })).toBe(false);
  });
});
