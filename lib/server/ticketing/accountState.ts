/**
 * Normalize a Stripe Connect account into Click's stored readiness state.
 *
 * Pure mapping (no Stripe import) so it is unit-testable and the rest of the
 * codebase never branches on raw Stripe fields. `ready` is the only state
 * that permits publishing a paid event; a generic `details_submitted` is
 * deliberately not sufficient (requirements can become due again later).
 */

export type StripeAccountSnapshot = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersActive: boolean;
  detailsSubmitted: boolean;
  currentlyDueCount: number;
  eventuallyDueCount: number;
  disabledReason: string | null;
};

export type OnboardingState =
  | 'not_started'
  | 'in_progress'
  | 'restricted'
  | 'ready'
  | 'disabled';

export function normalizeOnboardingState(s: StripeAccountSnapshot): OnboardingState {
  if (s.disabledReason && /rejected|listed|platform_paused/.test(s.disabledReason)) {
    return 'disabled';
  }
  if (s.transfersActive && s.payoutsEnabled && s.currentlyDueCount === 0) {
    return 'ready';
  }
  if (s.detailsSubmitted) {
    // Was submitted but something is due or a capability is off.
    return 'restricted';
  }
  return s.currentlyDueCount > 0 || s.eventuallyDueCount > 0 ? 'in_progress' : 'not_started';
}

/** Shape persisted onto organizer_payment_accounts. */
export function accountRowPatch(s: StripeAccountSnapshot): Record<string, unknown> {
  return {
    onboarding_state: normalizeOnboardingState(s),
    charges_enabled: s.chargesEnabled,
    payouts_enabled: s.payoutsEnabled,
    transfers_enabled: s.transfersActive,
    details_submitted: s.detailsSubmitted,
    requirements_currently_due_count: s.currentlyDueCount,
    requirements_eventually_due_count: s.eventuallyDueCount,
    requirements_disabled_reason: s.disabledReason,
    last_stripe_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
