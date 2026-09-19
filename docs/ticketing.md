# Ticketed Events via Stripe Connect

Backend implementation of paid event tickets, layered under the existing
event domain (`map_beacons` with `beacon_type = 'event'`). The social event
object stays what it was — host, time, RSVP, hub, check-in — while ticketing
adds a financial domain beneath it: inventory, orders, payment settlement,
refunds, admission credentials, and organizer payout state.

Spec status: v1 backend slice (schema, Connect onboarding, checkout,
webhook fulfillment, check-in, refunds). KMP client integration and organizer
dashboard UI are follow-ups.

## Stripe model

- **Connect destination charges**: the payment is created on Click's platform
  account, Click retains an `application_fee_amount`, and the remainder is
  transferred to the organizer's connected (Express) account. The platform is
  responsible for processing fees, refunds, and chargebacks — reflected in
  order/dispute state rather than assumed away.
- **Stripe-hosted Checkout** (30-minute sessions), opened in the system
  browser. The return redirect is navigation only; fulfillment happens only
  after a verified webhook.
- **Hosted Connect onboarding** via single-use Account Links, never stored.
  Returning from Stripe proves nothing; `GET /api/payments/connect/status`
  re-syncs and normalizes readiness (`ready` requires active `transfers`
  capability + payouts enabled + nothing currently due — not just
  `details_submitted`).
- `on_behalf_of` is deliberately not set in v1: Click is the business of
  record. Changing the settlement merchant is a policy decision, not a
  per-payment option.

## Source of truth

Postgres owns product truth (orders, tickets, admission); Stripe owns
external financial execution. The app reads local projections; webhooks
reconcile Stripe state into them. Client callbacks are never trusted for
payment state, and clients never submit prices, fees, or account ids.

## Schema (20260919120000_ticketing_foundation.sql)

| Table | Purpose |
|---|---|
| `organizer_payment_accounts` | Normalized Connect account readiness, one per organizer |
| `map_beacons` (+cols) | `admission_type`, `ticketing_status`, sales window, `organizer_payment_account_id`, `refund_policy` |
| `ticket_tiers` | Sellable inventory pools (multi-tier from day one) |
| `ticket_orders` | Durable Click↔Stripe reconciliation object; `order_state` (payment) and `fulfillment_state` (issuance) are separate facts |
| `ticket_order_items` | Priced line items with tier-name snapshots |
| `ticket_inventory_holds` | 32-minute reservations created transactionally with the order |
| `tickets` | Minted credentials; `unique(order_id, ordinal)` guards duplicate minting; stores only the SHA-256 of the QR token |
| `ticket_checkins` | Append-only scan log (accepted and rejected) |
| `ticket_refunds` | Refund lifecycle keyed on `stripe_refund_id` |
| `stripe_webhook_events` (+cols) | Ledger columns (`processing_state`, `payload`, …) on the existing idempotency table |

All financial writes go through `SECURITY DEFINER` RPCs granted to
`service_role` only: `ticketing_reserve_order` (row-locked capacity =
sold + active holds), `ticketing_cancel_order`, `ticketing_expire_stale`,
`ticketing_fulfill_order`, `ticketing_check_in`, `ticketing_apply_refund`,
`ticketing_mark_disputed`. RLS gives attendees read access to their own
orders/tickets and active tiers; nothing client-side can mint, pay, or void.

## API surface

```
POST /api/payments/connect/onboarding          organizer → Account Link URL
GET  /api/payments/connect/status              normalized payout readiness
GET/POST /api/beacons/:id/tickets/tiers        list / organizer create
POST /api/beacons/:id/tickets/status           organizer sales lifecycle (publish gate)
POST /api/beacons/:id/tickets/checkout         reserve + hosted Checkout URL
GET  /api/beacons/:id/tickets                  buyer's tickets (?include_credential=1 rotates + returns QR token)
POST /api/beacons/:id/tickets/check-in         staff scan (atomic RPC)
GET  /api/orders/:orderId                      buyer polling after browser return
POST /api/orders/:orderId/refunds              organizer refund (reverse_transfer + refund_application_fee)
POST /api/webhooks/stripe                      shared with venue subscriptions
GET  /api/cron/ticketing-expiry                stale-hold sweep (CRON_SECRET)
```

Ticket-backed attendance: fulfillment upserts `beacon_attendees` with
`source = 'ticket'`, so hub access follows automatically; a full refund
removes only ticket-sourced attendance, never an independent RSVP.

## Webhook semantics

Ticketing events (`checkout.session.completed/expired/async_payment_*`,
`refund.updated`, `charge.dispute.created`, `account.updated`) use ledger
semantics on `stripe_webhook_events`: a failed handler marks the row
`failed` and returns 5xx so Stripe redelivery retries it; a processed row
short-circuits as duplicate. Fulfillment re-verifies the PaymentIntent
server-side (amount, currency, destination account, application fee against
the immutable order snapshot) before minting tickets. The venue-subscription
flow keeps its original insert-once guard.

## Rollout

`TICKETING_ENABLED=false` keeps every route dark. Launch prerequisites
before enabling in production: Click business bank account connected to the
platform account, live Connect settings + settlement-merchant policy
reviewed, production webhook secret configured (pinned API version), refund
policy wording, `ticketing-expiry` added to the cron schedule, and low-dollar
live test transactions.
