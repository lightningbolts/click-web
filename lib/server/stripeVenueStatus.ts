import type { SubscriptionStatus } from '@/types/insights-schema';

/**
 * Map Stripe subscription statuses to `venues.subscription_status` CHECK values.
 */
export function stripeSubscriptionStatusToVenue(
  status: string | null | undefined,
): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'unpaid':
      return 'unpaid';
    case 'incomplete':
    case 'incomplete_expired':
      return 'incomplete';
    case 'paused':
      return 'past_due';
    default:
      return 'inactive';
  }
}
