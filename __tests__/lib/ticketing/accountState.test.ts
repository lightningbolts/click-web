/**
 * @jest-environment node
 */
import {
  normalizeOnboardingState,
  type StripeAccountSnapshot,
} from '@/lib/server/ticketing/accountState';

function snapshot(overrides: Partial<StripeAccountSnapshot>): StripeAccountSnapshot {
  return {
    chargesEnabled: false,
    payoutsEnabled: false,
    transfersActive: false,
    detailsSubmitted: false,
    currentlyDueCount: 0,
    eventuallyDueCount: 0,
    disabledReason: null,
    ...overrides,
  };
}

describe('normalizeOnboardingState', () => {
  it('is ready only with active transfers, payouts, and nothing currently due', () => {
    expect(
      normalizeOnboardingState(
        snapshot({ transfersActive: true, payoutsEnabled: true, detailsSubmitted: true }),
      ),
    ).toBe('ready');
  });

  it('details_submitted alone is not ready', () => {
    expect(normalizeOnboardingState(snapshot({ detailsSubmitted: true }))).toBe('restricted');
  });

  it('newly due requirements demote a previously ready account', () => {
    expect(
      normalizeOnboardingState(
        snapshot({
          transfersActive: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          currentlyDueCount: 2,
        }),
      ),
    ).toBe('restricted');
  });

  it('rejected accounts are disabled regardless of capabilities', () => {
    expect(
      normalizeOnboardingState(
        snapshot({
          transfersActive: true,
          payoutsEnabled: true,
          disabledReason: 'rejected.fraud',
        }),
      ),
    ).toBe('disabled');
  });

  it('distinguishes not_started from in_progress', () => {
    expect(normalizeOnboardingState(snapshot({}))).toBe('not_started');
    expect(normalizeOnboardingState(snapshot({ currentlyDueCount: 5 }))).toBe('in_progress');
  });
});
