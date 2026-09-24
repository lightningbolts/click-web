const messages: Record<string, string> = {
  existing_free_attendees: 'This event already has free RSVPs. Create a separate ticketed event.',
  financial_organizer_required: 'Only the event’s financial organizer can change sales or payouts.',
  over_order_limit: 'This quantity exceeds the per-order limit.',
  sales_not_open: 'Ticket sales are not open.',
  sales_not_started: 'Ticket sales have not started yet.',
  sales_ended: 'Ticket sales have ended.',
  price_changed: 'The ticket price changed. Review the updated price and try again.',
  duplicate_tier: 'A ticket type was selected more than once.',
  refund_needs_attention: 'This refund needs review. Contact support before submitting another.',
  ticket_not_valid: 'This ticket is no longer valid for admission.',
  Unauthorized: 'Sign in to continue.',
  Forbidden: 'You do not have access to this action.',
  forbidden: 'You do not have access to this action.',
  attempt_conflict: 'This checkout was already started with different tickets.',
  order_not_refundable: 'This order cannot be refunded in its current state.',
  ticket_not_refundable: 'One of these tickets is no longer refundable. Refresh the order.',
  refund_request_conflict: 'This refund was already submitted with different details.',
  ticketing_disabled: 'Ticket sales are not available yet.',
  invitation_required: 'This event is invite-only. Ask the host to add you.',
  insufficient_inventory: 'There are not enough tickets left. Refresh and choose again.',
  over_user_limit: 'You have reached the ticket limit, including tickets held in checkout.',
  organizer_not_ready: 'The organizer must finish payout setup before sales can open.',
  capacity_below_committed: 'Capacity cannot be lower than sold tickets and checkout reservations.',
  refund_in_progress: 'A refund already includes one of these tickets.',
  invalid_transition: 'This sales transition is not allowed.',
  no_active_tiers: 'Add an active, paid ticket tier with capacity before opening sales.',
  checkout_finished: 'This checkout has finished. Check your tickets.',
  checkout_needs_attention:
    'Your checkout needs review. Contact the organizer before trying again.',
  invalid_sales_window: 'Sales must end after they start.',
};
export function ticketingError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  return messages[code] ?? 'We could not complete this request. Please try again.';
}
