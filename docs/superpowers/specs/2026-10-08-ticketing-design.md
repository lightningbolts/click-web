# Click Ticketing — Design

Date: 2026-10-08 · Repos: `click-web` (owner of all ticketing), `click-ios` (consumer UI only)

## 1. Intent

Finish ticketing so a real user can go through the whole lifecycle without manual database work:

organizer creates a ticketed event on web → consumer sees it on web/iOS → consumer buys or claims →
payment confirmed by webhook → ticket appears on web + iOS → organizer sees the attendee →
organizer scans/checks in → ticket shows as used everywhere.

Web owns organizer configuration, inventory, checkout, issuance, attendees, check-in, refunds and
cancellation. iOS gets only the consumer experience. The server is authoritative for payment,
inventory, ownership, ticket validity and check-in.

### Decisions (agreed 2026-10-08)

| Topic | Decision |
|---|---|
| Free tickets | Supported. $0 ticket types are claimed instantly with no Stripe, with limited inventory and check-in. Hosts can use them before any Stripe setup. |
| Platform fee | The organizer absorbs it (current `feePolicy` v1: 5% `application_fee_amount`). The buyer pays face value; the summary shows "Fees: None". |
| RSVP vs ticket | On a ticketed event, a ticket replaces the RSVP: getting a ticket makes you going (`beacon_attendees.source='ticket'`) and the ticket QR replaces the Click Pass. |
| Pre-existing RSVPs | People who RSVP'd before ticketing was turned on stay going, and their Click Pass still works at the door. New attendees must get a ticket. |
| Turning ticketing off | Not allowed once any ticket has been issued; the organizer pauses or closes sales instead. |
| Cancellation | "Cancel event" marks the event cancelled (it stays visible with a banner), voids free tickets, and fully refunds every paid order through Stripe automatically. |
| Credentials | Option A: a per-ticket HMAC code (v2) in Click Pass's URL format, with one shared door scanner for passes and tickets. |

## 2. What already exists (PR #71) and is kept

`supabase/migrations/20260919120000_ticketing_foundation.sql`, `lib/server/ticketing/*`, and the
ticketing routes in `docs/ticketing.md`: ticket types (`ticket_tiers`), orders, order items,
inventory holds, tickets, check-ins and refunds; the locked server-only database functions
`ticketing_reserve_order`, `ticketing_cancel_order`, `ticketing_expire_stale`,
`ticketing_fulfill_order`, `ticketing_check_in`, `ticketing_apply_refund` and
`ticketing_mark_disputed`; Stripe Connect destination charges, hosted Checkout, webhook
fulfillment that re-checks the PaymentIntent, refunds and disputes; the Stripe event log; the
expiry cron; and the `TICKETING_ENABLED` rollout flag.

### Gaps this design closes

- Stripe's `success_url`/`cancel_url` point at `/events/{id}/tickets/return`, which doesn't exist.
- `GET /api/beacons/:id/tickets?include_credential=1` replaces the QR secret on every read, so web and iOS invalidate each other's QR.
- The event payloads don't expose ticketing state; there's no public offerings response with availability.
- No ticket type edit, disable or delete; no organizer summary or attendee endpoints; no "my tickets"; no free path; no event cancellation; event `DELETE` returns 500 once orders exist (FK `RESTRICT`).
- No UI on either platform.
- The Click Pass door scanner and ticket check-in are separate systems.

## 3. Data model (new migration `20261027000000_ticketing_completion.sql`)

Additive and compatible with existing event data; every existing event keeps admission `rsvp`.

1. **`map_beacons.admission_type`**: values `free`/`paid` become `rsvp`/`ticketed` (rewrite rows, then swap the CHECK constraint; default `rsvp`). A ticketed event may have free and/or paid types.
2. **`map_beacons.event_cancelled_at TIMESTAMPTZ NULL`**.
3. **`ticket_tiers.archived_at TIMESTAMPTZ NULL`**. Archived types are hidden everywhere except order history. Index on `(beacon_id, sort_order) WHERE archived_at IS NULL`.
4. **`ticket_orders.organizer_payment_account_id`** becomes nullable, with `CHECK (total_amount = 0 OR organizer_payment_account_id IS NOT NULL)`.
5. **`ticket_checkins.result`** gains `'refunded'` and `'event_cancelled'` (the scanner shows them differently from `void`).
6. **Internal function `ticketing_validate_items(p_buyer, p_beacon, p_items)`**: the per-item validation currently inside `ticketing_reserve_order` (tier belongs to the event, active and not archived, currency, price-drift guard, sales windows, per-order and per-user limits, sold + active holds ≤ capacity), run under the same `ORDER BY id FOR UPDATE` locks. It returns `{ok, code, subtotal}`. `ticketing_reserve_order` is redefined to call it, so free and paid share one validator. The organizer-readiness check runs only when `subtotal > 0`, and the event must not be cancelled.
7. **`ticketing_claim_free(p_buyer, p_beacon, p_items, p_tickets)`**: validate (subtotal must be 0) → insert order (`order_state='paid'`, `total=0`, no account, `paid_at=now()`) + items → mint tickets from `p_tickets` (same payload as fulfillment) → `fulfillment_state='fulfilled'` → upsert `beacon_attendees` (`source='ticket'`). All in one transaction.
8. **`ticketing_update_tier(p_tier, p_patch JSONB)`**: locks the tier; rejects `capacity < sold + active holds` (`capacity_below_sold`) and a free↔paid change once anything has sold (`price_kind_locked`); applies name, description, price, capacity, limits, window, sort order and is_active. Price changes are allowed; orders keep their own snapshot and the existing price-drift guard catches in-flight checkouts.
9. **`ticketing_cancel_event(p_beacon)`**: locks the event; sets `event_cancelled_at` and `ticketing_status='sales_closed'`; cancels `reserved`/`checkout_created` orders (releasing holds); voids `valid` tickets on free orders; removes their ticket-sourced attendance; returns the paid orders that still need refunds. Idempotent.
10. **`ticketing_check_in`** returns `event_cancelled` when the event is cancelled and `refunded` for refunded tickets (`void` stays for other voided tickets); each is logged as a rejected scan. Manual lookup resolves `ticket_id` → `qr_token_hash` in the route (scoped to the event) and calls the same function.
11. **`ticketing_expire_stale`** stays as is; the cron route also retries refunds for cancelled events whose paid orders aren't fully refunded (§4.6).

All new functions are `SECURITY DEFINER`, `SET search_path = public`, granted to `service_role` only.

## 4. Server

### 4.1 Credentials (v2 tickets in Click Pass format)

- `lib/events/eventPass.ts` gains a version-2 code: `2.{base64url(ticketId)}.{base64url(HMAC(key, "click-ticket:v2:{beacon}:{ticket}")[0..16])}`. The URL is unchanged: `https://joinclick.co/e/{beacon}?pass={token}`. `parsePassCredential` already accepts any token; a new `verifyTicketToken(key, beaconId, token) → ticketId | null` checks it in constant time.
- Issuing tickets (`buildTicketMints`, the free claim) generates the ticket UUID on the server, computes the v2 code, and stores `qr_token_hash = sha256(token)` so `ticketing_check_in`'s hash lookup and row lock stay unchanged. A leaked database still can't produce codes without the key.
- Owner reads compute the code fresh (`issueTicketCredential(key, beacon, ticketId)`); nothing rotates. `eventPassCode(token)` gives the short display code.
- `/t/{token}` URLs and `ticketQrUrl`/`mintTicketCredential` are removed (never released).

### 4.2 Event payload

`PublicEventPayload` (web) and `GET /api/beacons/:id` (iOS) gain, only when `ticketingEnabled()` and `admission_type='ticketed'`:

```ts
ticketing: {
  status: 'draft' | 'ready' | 'sales_open' | 'sales_paused' | 'sales_closed';
  cancelled: boolean;
  from_amount: number | null;   // lowest active price, cents; 0 = has free tickets
  currency: string;             // 'usd'
  available: boolean;           // some active type is on sale right now
  my_ticket_count: number;      // live tickets the viewer owns (0 when signed out)
} | null
```

### 4.3 Shared domain module

`lib/server/ticketing/offerings.ts` is the one place that turns tiers + sold/held counts into consumer availability:

`availability: 'on_sale' | 'sold_out' | 'not_started' | 'ended' | 'paused'`, `remaining: number | null` (only when ≤ 10), `max_quantity` (min of max_per_order, remaining and the per-user limit). The routes, the event page server component and the payload all use it. Counts come from a single grouped query, not one query per type.

### 4.4 API surface

| Method | Route | Who | Notes |
|---|---|---|---|
| GET | `/api/beacons/:id/tickets/tiers` | anyone | Consumer offerings via `offerings.ts`. `?manage=1` (event manager) adds inactive types, sold/held/capacity counts. |
| POST | `/api/beacons/:id/tickets/tiers` | manager | Existing; also turns admission to `ticketed` + status `draft` on the first type. |
| PATCH | `/api/beacons/:id/tickets/tiers/:tierId` | manager | → `ticketing_update_tier`. |
| DELETE | `/api/beacons/:id/tickets/tiers/:tierId` | manager | Hard-delete when no order item references it, otherwise set `archived_at` + `is_active=false`. |
| POST | `/api/beacons/:id/tickets/status` | manager | Existing; payout readiness needed only if an active paid type exists. `disabled` is allowed only when no tickets were ever issued. |
| POST | `/api/beacons/:id/tickets/checkout` | buyer | Paid → `{order_id, checkout_url}` (unchanged). All-free → `ticketing_claim_free` → `{order_id, status:'fulfilled'}`. Mixing free and paid in one order isn't allowed (`mixed_order`); the picker never produces one. Optional `client: 'ios'` only adds `click_client` metadata. |
| GET | `/api/orders/:orderId` | buyer | Existing; adds `beacon_id` and `ticket_count`. |
| GET | `/api/beacons/:id/tickets` | buyer | My tickets for the event, each with `credential_url`, `code`, `tier_name`, `status`, `checked_in_at`, `order_id`. No rotation. |
| GET | `/api/me/tickets` | buyer | All my live and historical tickets grouped by event: event title, time, location, image, seed, cancelled; `?scope=upcoming|past`. |
| GET | `/api/tickets/:ticketId` | owner | One ticket + its order summary (items, subtotal, fees, total, paid_at, refunds). 404 for missing and for someone else's ticket. |
| GET | `/api/beacons/:id/tickets/summary` | manager | `{sold, capacity, checked_in, gross_cents, refunded_cents, net_cents, tiers:[{id,name,sold,capacity,unit_amount}]}`. |
| GET | `/api/beacons/:id/tickets/attendees?q=&cursor=` | manager | Tickets joined with holder name/avatar, type, status, checked_in_at, order_id; name search; 50 per page. |
| POST | `/api/beacons/:id/pass/scan` | manager | Unified: v1 → existing RSVP pass logic; v2 → `ticketing_check_in`; `{ticket_id}` (manual lookup) → the same function by id. Response gains `tier_name`, results `refunded`, `event_cancelled`. |
| POST | `/api/beacons/:id/cancel` | manager | `ticketing_cancel_event` then `requestTicketRefund` for each paid order (Stripe idempotency keys). Returns `{refunds_started, refunds_failed}`. |
| DELETE | `/api/beacons/:id` | creator | Returns 409 `has_ticket_orders` when orders exist. |
| POST | `/api/webhooks/stripe` | Stripe | Unchanged semantics. |

`/api/beacons/:id/tickets/check-in` is removed (no client ever used it). `lib/api/schemas/ticketing.ts` gains `updateTierBodySchema`, and `passScanBodySchema` becomes a credential-or-ticket_id union.

Authorization: `requireEventManager` (creator plus Place owners/managers) for organizer routes; `getSupabaseFromRouteRequest` for buyers; ownership always from the authenticated user id, never from the request body. All routes return `ticketing_disabled` 403 while the flag is off, except `pass/scan` v1, which works as today.

### 4.5 Check-in side effects (shared)

The current pass-scan acceptance (`event_check_ins` upsert with `source`, `insertEngagementEvent`, `grantEventHubOnCheckIn`, the live count) moves into `lib/server/events/doorCheckIn.ts`, called by both v1 and v2 acceptance. A ticket scan records `source='ticket_scan'`.

### 4.6 Stripe return, cancellation and refund retry

- `success_url = {base}/e/{id}/tickets/return?order={order}`; `cancel_url` adds `&canceled=1`. The return page is navigation only.
- On a cancel, refunds whose Stripe call failed stay on paid orders; `GET /api/cron/ticketing-expiry` also finds `event_cancelled_at IS NOT NULL` events with `order_state IN ('paid','partially_refunded')` and retries `requestTicketRefund` (its idempotency key is per ticket set).

## 5. Web UI

All built from `components/ds` (ListGroup, Sheet/Dialog, ConfirmDialog, StatTile, StatusPill, SegmentedControl, SearchField, PersonRow, Button, InlineNotice, Toggle, TextField, EmptyState, Skeleton) and the existing event typography and spacing. Files stay under the 1000-line limit.

1. **Editor** (`components/events/tickets/TicketingSection.tsx` + `TicketTierSheet.tsx`, mounted in `EventForm` after OptionsGroup):
   - **Toggle:** "Sell or hand out tickets".
   - **Ticket type list:** each row shows name, "Free" or "$15.00", "78 / 100 left", "Sales end Oct 24, 7:00 PM", and a status pill (Sold out / Hidden).
   - **Ticket type sheet:** name, description, price (blank or 0 = Free), capacity, max per order, optional sales window.
   - **Validation as you type:** negative values, capacity 0, end before start, capacity below sold, free↔paid locked after sales.
   - **Saving:** edit mode saves each change straight to the API with toasts. Create mode keeps types locally and creates them after `POST /api/beacons` succeeds, then sets status `sales_open` (or `draft` if payouts aren't ready).
   - **Sales controls:** a sales state segment (Open / Paused / Closed) and an InlineNotice "Set up payouts to sell paid tickets" that opens the Connect onboarding link.
   - **Locked actions:** "Delete" turns into "Hide" once sold, with an explanation.
2. **Event page** (`TicketPurchaseCard.tsx`, which takes the RSVP card's place when ticketed):
   - **Choosing tickets:** one type → quantity stepper; several → rows with steppers. Unavailable types stay visible with the reason.
   - **Summary:** line items, "Fees: None", total. CTA: "Get tickets" / "Claim free tickets" / "Checkout · $24.00".
   - **Signed out:** the CTA goes to `loginHref`.
   - **States:** owned → "You have 2 tickets · View"; cancelled → banner, no CTA.
   - **Errors:** a sold-out or price-changed response refreshes the offerings and shows an inline notice.
3. **Return page** (`app/(app)/e/[beaconId]/tickets/return/page.tsx` + client poller): SWR polling `GET /api/orders/:id` with backoff for up to 60 s. Outcomes: confirmed → `router.replace` to the tickets; canceled → "No charge was made"; failed or expired → retry CTA; timeout → "Still confirming. We'll notify you; it's safe to leave."
4. **Tickets screen** (`/e/:id/pass`): when ticketed, `ClickPassView` gets a `tickets` mode. "1 of N" switcher; ticket type and StatusPill; the QR on a white tile, `min(100%, 300px)`, with a quiet zone ≥ 4 modules; an "Order details" disclosure; a refunded, void or cancelled ticket replaces the QR with a status message.
5. **Ticket wallet** (`app/(app)/tickets/page.tsx`): SegmentedControl Upcoming/Past, event rows (reusing `EventRow`) linking to `/e/:id/pass`; EmptyState linking to Events. Linked from the Me menu and `YourEventsStrip`.
6. **Organizer tab** (`/e/:id/manage/tickets`, added to `TABS`, plus an Overview summary card):
   - **Numbers:** StatTiles for sold / capacity, checked in, gross.
   - **Per type:** a ListGroup of sold / capacity.
   - **Attendees:** SearchField + paged list (PersonRow + type + StatusPill) with a row Menu: Check in, Refund ticket, Refund order (ConfirmDialog).
   - **Header actions:** "Open scanner", "Cancel event" (ConfirmDialog stating the refund consequence).
7. **Door scanner** (`PassScanner`): new result looks (Refunded, Event cancelled), the ticket type under the name, and a "Look up guest" button that opens a Sheet with attendee search and check-in, without leaving the camera page.

## 6. iOS (consumer only)

- **`Core/Beacons/Ticketing.swift`**: models (`EventTicketing`, `TicketOffering`, `TicketOrderStatus`, `OwnedTicket`, `TicketDetail`) and `TicketingRepository` (offerings, checkout, order, eventTickets, myTickets, ticket) using `ClickAPIClient`, a `MemoryCache` + `LocalStore` copy of owned tickets for offline display (same pattern as `EventEngagementRepository`'s pass cache).
- **`MapBeacon`** decodes the optional `ticketing`; when it's missing, behavior is unchanged.
- **`BeaconDetailView`**: when `ticketing != nil`, `ticketButton` replaces `rsvpButton` (same style: "Get Tickets · from $12", "Claim free tickets", "Sold out", "Sales ended", disabled when unavailable); a cancelled banner; `passCard` reads "Your tickets · N". New code goes in `Features/Events/Tickets/` to keep the detail view from growing.
- **`TicketPickerSheet`**: `.presentationDetents([.medium, .large])`, offerings loaded each time it opens, steppers, summary, CTA; server rejections refresh it with an inline reason; network errors keep the selection and offer retry.
- **`TicketCheckout`**: `ASWebAuthenticationSession(url:callback: .https(host: "joinclick.co", path: "/e/{id}/tickets/return"))`, reusing GoogleSignIn's presentation-anchor code; cancel closes back to the sheet with the selection kept; on callback, polls `GET /api/orders/:id` (same outcomes and 60 s limit as web) → on fulfilled, refresh the event and tickets, push `.eventPass`.
- **`ClickPassView` (iOS)**: a tickets mode matching web: page switcher, a white QR tile (`max 300pt`, `.interpolation(.none)`, unaffected by dark mode), type + status, an order-details disclosure, a status message instead of the QR when the ticket isn't valid, an "Updated X ago" note when offline; refreshes on appear and when the app returns to the foreground; Add to Apple Wallet via the extended wallet endpoint.
- **`TicketsView`** + `AppRoute.tickets` (Me tab): upcoming/past list → `.eventPass`.
- **`PassScannerView`**: maps the new scan results and shows the ticket type. No other organizer work on iOS.

## 7. Apple Wallet

`/api/beacons/:id/pass/wallet?ticket={id}` issues the pkpass for an owned live ticket (barcode = the v2 URL, serial = ticket id, "TICKET" field = type). It reuses `walletPassJson` with an optional ticket field.

## 8. Error handling summary

| Situation | Behavior |
|---|---|
| Concurrent last-ticket buyers | Row locks; the loser gets 409 `insufficient_inventory` → offerings refresh, "Only N left" / "Sold out". |
| Price changed mid-flow | 409 `price_changed` → refresh and ask to confirm again. |
| Duplicate or out-of-order webhooks | Event log + order-state guards + `unique(order_id, ordinal)`. |
| Checkout abandoned | Stripe `expired` webhook or the cron releases holds; the return page shows "No charge was made". |
| Return before the webhook | Polls up to 60 s, then "still confirming"; the tickets appear by themselves later. |
| Duplicate scan | Exactly one `accepted`; then `already_checked_in` with the time. |
| Refund / cancel | Ticket → `refunded`/`void`; scans reject; UIs replace the QR with the status. |
| Unauthenticated / non-owner / non-manager | 401 / 404 (ownership hidden) / 403. |
| Flag off | No `ticketing` block in payloads, routes 403, UIs unchanged. |

## 9. Testing

- **pgTAP** `supabase/tests/ticketing_security.sql`: grants/RLS, validator codes, claim-free, update-tier limits, archive, cancel-event, check-in cancelled result. A **concurrency** script (two `psql` sessions against local Supabase) for last-ticket and double-scan races.
- **Jest:** credentials v1/v2 (tampering, wrong event), `offerings` availability, every new route's auth matrix + flag, checkout free/paid/mixed, webhook replay/out-of-order, cancel-event partial refund failure + cron retry, scan dispatch, UI components (stepper limits, totals, return-page outcomes, organizer summary).
- **XCTest:** decoding (with and without `ticketing`), picker state, order polling, ticket status display.
- **Visual:** web harness at 320/390/768/1280 px light/dark; iOS ImageRenderer PNGs on iPhone SE, 16 and 16 Pro Max, light/dark.
- **E2E in Stripe test mode** (if local test keys + Stripe CLI are available): the full lifecycle above plus a declined card and a cancelled checkout.
- **Gates before PR:** web `typecheck`, `lint`, `test`, `build`; iOS `xcodebuild test`.

## 10. Rollout

Web PR first (API + UI), then iOS PR. Everything is behind `TICKETING_ENABLED`. Migrations aren't applied to production by the agent. `docs/ticketing.md` is updated with the new surface and launch checklist (bank account, live Connect settings, webhook secret, `ticketing-expiry` cron, low-dollar live test).

## 11. Out of scope

iOS organizer surfaces; buyer-paid fees; seating and promo codes; ticket transfers; mixed free+paid orders; refunds started by the buyer.
