# Ticketed Events via Stripe Connect

Backend implementation of paid event tickets, layered under the existing
event domain (`map_beacons` with `beacon_type = 'event'`). The social event
object stays what it was — host, time, RSVP, hub, check-in — while ticketing
adds a financial domain beneath it: inventory, orders, payment settlement,
refunds, admission credentials, and organizer payout state.

Status: complete on web (spec `docs/superpowers/specs/2026-10-08-ticketing-design.md`).
Organizers set up ticket types in the event editor and run sales, attendees,
door check-in, refunds and cancellation from the manage Tickets tab. Buyers
pick tickets on the event page, pay on Stripe Checkout (or claim free tickets
without Stripe), and keep their tickets on the event's pass page and at
`/tickets`. The iOS app buys and claims through this API.

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

## Admission and pricing

- `map_beacons.admission_type` is `rsvp` or `ticketed`. A ticket replaces the
  RSVP on a ticketed event; free tickets are a ticketed event whose tiers cost
  nothing.
- **Free claims** (`ticketing_claim_free`) reserve and issue in one locked
  transaction and never touch Stripe. A paid order never mixes with free
  tiers in the same checkout.
- **The organizer absorbs the fee.** Buyers pay face value and see "Fees:
  None"; Click's 5% `application_fee_amount` (`feePolicy` v1) comes out of the
  organizer's transfer.
- Paid tiers need a payout-ready Connect account (`organizer_not_ready`
  otherwise). Sales can open with free tiers alone.

## Ticket codes

Each ticket's QR is a version-2 Click Pass credential in the pass URL format,
`https://joinclick.co/e/{event}?pass=2.{ticket}.{sig}` — an HMAC over the
ticket id, stable across devices, never rotated. Only its SHA-256 is stored
(`tickets.qr_token_hash`). The door scanner (`/e/{id}/scan`) reads version-1
RSVP passes and version-2 tickets alike, and the host can check someone in by
name with **Look up guest**.

## Cancelling an event

`POST /api/beacons/:id/cancel` sets `event_cancelled_at` (via
`ticketing_cancel_event`), stops every ticket from admitting, and refunds
every paid order in full. Refunds that fail are retried by the
`ticketing-expiry` cron for 30 days. The organizer sees "Event cancelled. N
refunds started." and buyers see the cancellation on the event and pass pages.

## Schema (20260919120000_ticketing_foundation.sql, 20261027000000_ticketing_completion.sql)

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
| `map_beacons.event_cancelled_at` | Set once when the organizer cancels; tickets stop admitting |

All financial writes go through `SECURITY DEFINER` RPCs granted to
`service_role` only: `ticketing_reserve_order` (row-locked capacity =
sold + active holds), `ticketing_claim_free`, `ticketing_cancel_order`,
`ticketing_expire_stale`, `ticketing_fulfill_order`, `ticketing_update_tier`,
`ticketing_cancel_event`, `ticketing_check_in`, `ticketing_search_attendees`,
`ticketing_tier_counts`, `ticketing_apply_refund`, `ticketing_mark_disputed`.
The completion migration revokes `EXECUTE` on every one of them from
`PUBLIC`, `anon` and `authenticated` (the foundation migration had left them
callable by clients). RLS gives attendees read access to their own
orders/tickets and active tiers; nothing client-side can mint, pay, or void.

## API surface

```
POST   /api/payments/connect/onboarding                 organizer → Account Link URL
GET    /api/payments/connect/status                     normalized payout readiness (can_sell)
GET    /api/beacons/:id/tickets/tiers                   buyer offerings (availability, max_quantity)
POST   /api/beacons/:id/tickets/tiers                   organizer create
PATCH  /api/beacons/:id/tickets/tiers/:tierId           organizer edit / hide (locked rules once sold)
DELETE /api/beacons/:id/tickets/tiers/:tierId           organizer delete (unsold) or archive
POST   /api/beacons/:id/tickets/status                  sales lifecycle: draft | sales_open | sales_paused | sales_closed | disabled
POST   /api/beacons/:id/tickets/checkout                free → issued now; paid → reserve + hosted Checkout URL
GET    /api/beacons/:id/tickets                         the buyer's tickets for this event, with credentials
GET    /api/beacons/:id/tickets/summary                 organizer sales summary (sold, gross, net, refundable_orders)
GET    /api/beacons/:id/tickets/attendees               organizer attendee search (?q=, ?cursor=)
POST   /api/beacons/:id/cancel                          organizer cancel + refund every paid order
POST   /api/beacons/:id/pass/scan                       door check-in: { credential } or { ticket_id }
GET    /api/beacons/:id/pass/wallet?ticket=:ticketId    Apple Wallet pass for one ticket
GET    /api/me/tickets                                  ticket wallet (?scope=upcoming|past)
GET    /api/tickets/:ticketId                           one ticket with its order (owner only)
GET    /api/orders/:orderId                             buyer polling after the Checkout return
POST   /api/orders/:orderId/refunds                     organizer refund (whole order or ticket_ids)
POST   /api/webhooks/stripe                             shared with venue subscriptions
GET    /api/cron/ticketing-expiry                       stale holds + cancelled-event refund retries (CRON_SECRET)
```

Removed: `POST /api/beacons/:id/tickets/check-in` (folded into `pass/scan`)
and `?include_credential=1` (codes no longer rotate).

Web pages: `/e/:id` (ticket card), `/e/:id/tickets/return` (Checkout return),
`/e/:id/pass` (tickets), `/tickets` (wallet), `/e/:id/manage/tickets`
(organizer), `/e/:id/scan` (door).

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

`TICKETING_ENABLED=false` keeps selling, organizing and refunding dark (the
event page falls back to RSVPs). The wallet is separate: anyone who already
holds a ticket keeps `/tickets`, `GET /api/me/tickets`, their passes and door
check-in, so pausing sales never strands a ticket. `GET /api/me/features`
reports both as `ticket_sales` and `ticket_wallet`; iOS shows Tickets from the
latter. Apply the migrations with `npm run db:migrate` before
turning it on. Launch prerequisites before enabling in production: Click business bank account connected to the
platform account, live Connect settings + settlement-merchant policy
reviewed, production webhook secret configured (pinned API version), refund
policy wording, `ticketing-expiry` added to the cron schedule, and low-dollar
live test transactions.
