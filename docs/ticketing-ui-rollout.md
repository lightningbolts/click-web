# Ticketing UI and financial safeguards

## Rollout state

Ticketing remains **off by default**. Keep `TICKETING_ENABLED=false` in production.
This change does not apply migrations or configure Stripe on a remote environment.
The ticketing screens require the corrective migration as well as the existing foundation migration.

Implemented paths:

- `/e/{id}/manage#ticketing`: payout onboarding, tiers, sales lifecycle, paginated orders, refunds and totals.
- `/e/{id}`: server-rendered paid/free admission branch; public prices and quantity selection.
- `/e/{id}/tickets/return?order={id}`: bounded, abortable polling of local fulfillment state.
- `/e/{id}/tickets`: read-only wallet; explicit credential issuance/regeneration.
- `/e/{id}/manage/check-in`: camera QR detection where supported, plus manual entry.
- `/payments/connect/return` and `/payments/connect/refresh`: authenticated readiness refresh and fresh onboarding links with validated internal return paths.

## Financial and authorization rules

The event creator becomes its immutable financial principal on opting into paid admission. Venue managers may maintain tiers and scan tickets, but cannot select payout destinations, change sales state, or refund the creator's orders. Existing free RSVPs block conversion to paid admission; create a separate ticketed event instead.

Paid admission is protected by database triggers and route checks, including member signup/cancellation, guest signup and organizer approval. Only ticket fulfillment/refund RPCs write paid attendance. Mutable `source` values cannot grant or preserve admission. New financial RPCs and existing `ticketing_*` functions explicitly revoke execution from `PUBLIC`, `anon` and `authenticated`; clients use narrow API projections instead of financial-table reads.

Checkout requires a client-generated UUID `attempt_id`. A buyer/event/attempt uniqueness constraint and transaction locks reuse the order. The exact Stripe request is persisted before transmission, including immutable item prices, account destination, fees and absolute session expiry. Browser retries retain the same attempt for the same basket within the tab. Active holds count toward both capacity and per-user limits even after their nominal expiry.

Hold expiry is a reconciliation hint. The scheduled handler retrieves current Stripe state before releasing inventory. Processing payments retain inventory. Lost session responses are recovered by a bounded Stripe session listing over the creation window. An exhaustive empty result permits release only after the frozen request's expiry has passed; incomplete or ambiguous results retain holds and record `reconciliation_error`. The legacy database-only expiry sweep is deliberately inert.

Refund requests use a durable UUID `request_id`. The database locks the order and claims the exact ticket set before contacting Stripe; overlapping pending/succeeded requests are rejected. Stripe idempotency keys contain only that UUID, including six/eight-ticket refunds. Retries after 23 hours with an unlinked Stripe result require reconciliation rather than replaying an expired idempotency key. Pending refunds never optimistically void tickets. Stripe's refunded application fee is synchronized for net totals rather than approximated in the browser.

Webhook handlers retrieve current external objects, so a delayed expiry event cannot overwrite a completed payment. Hard mismatches are recorded as `needs_attention`; transport/database errors remain `retryable_failure`. Duplicate payment notifications after a refund do not reissue admission. The non-ticketing subscription webhook branch is preserved.

## Reconciliation operations

Schedule authenticated `GET /api/cron/ticketing-expiry` with `Authorization: Bearer <CRON_SECRET>` while ticketing is enabled. It handles bounded batches of expired local orders and pending/recent refunds. Processed records move to the end of the reconciliation queue. Monitor the returned `needs_attention` count and these durable fields:

- `stripe_webhook_events.processing_state`, `last_error`
- `ticket_orders.reconciliation_error`
- `ticket_refunds.reconciliation_error`, `last_reconciled_at`

For an ambiguous payment/refund, retrieve the external Stripe object by the local order/request metadata and reconcile it. Do not manually release holds, erase refund claims, replay a new refund request, or change ticket states to hide an unresolved money movement. Dashboard-created refunds without Click ticket-allocation metadata require operator reconciliation; do not use them as the normal refund workflow.

## Automated validation

Run the usual `npm run typecheck`, `npm run lint`, `npm test -- --runInBand` and `npm run build`.
Focused component and route tests cover gating, tier projections/patches, explicit QR issuance, checkout retries, local order status, payout return paths, refund confirmation and organizer totals.

For real concurrency tests, point at a **local disposable PostgreSQL server**:

```sh
TICKETING_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:ticketing:postgres
```

The runner refuses remote hosts, creates a uniquely named test database with the minimal surrounding schema, applies both ticketing migrations, and uses independent connections. It checks last-ticket races, concurrent retries, user hold limits, late fulfillment, admission bypasses, double scans, refund overlaps, six/eight-ticket refunds, immutable snapshots, lifecycle and grants. The existing Supabase CI job separately applies the complete repository migration history before running this test. `TICKETING_TEST_KEEP_DATABASE=true` retains the isolated test database for investigation; this was used with the local Windows PostgreSQL runtime because its database-drop barrier stalled under emulation.

## Required before enabling sales

No local Stripe/Supabase configuration was available for this implementation. **Stripe test-mode E2E remains outstanding.** In a disposable configured environment, verify:

1. Creator Connect onboarding, return, refresh, restricted account and successful readiness sync.
2. Draft event, tier creation/edit/deactivation, open/pause/close, and venue-manager restrictions.
3. Buyer checkout, duplicate submission and browser return before/after webhook delivery.
4. Canceled and expired sessions, deliberately delayed delivery, lost HTTP response recovery and hard financial mismatch alerts.
5. Wallet display and explicit QR issuance; reloading does not rotate the credential.
6. Concurrent scans, wrong-event scans, full/partial refunds, overlapping refund requests and refunded QR rejection.
7. Invite-only authorization and unchanged free-event flows with the feature flag off.

The local production build encountered blocked Google Fonts downloads (Manrope and Source Serif 4). Run the normal production and Cloudflare worker builds in CI with network access; a successful TypeScript check is not a substitute for those builds. Complete Stripe test-mode checks, confirm webhook/cron coverage, refund and payout/liquidity policies, then perform the planned low-dollar live transaction checks before production enablement.
