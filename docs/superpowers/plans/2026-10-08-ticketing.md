# Click Ticketing Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Click ticketing end to end. Web owns organizer setup, sales (free and Stripe-paid), issuance, wallet, organizer dashboard, check-in and cancellation; iOS gets the consumer purchase and ticket experience.

**Architecture:** Extend the PR #71 backend (`lib/server/ticketing/*`, `20260919120000_ticketing_foundation.sql`) with one completion migration, a shared offerings module, and v2 ticket codes in Click Pass's URL format, so one door scanner and one pass screen serve both RSVPs and tickets. Web UI is built from `components/ds`; iOS adds a `TicketingRepository`, a native picker sheet, `ASWebAuthenticationSession` checkout, and a tickets mode in the existing `ClickPassView`.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Supabase (Postgres, pgTAP) / Stripe 21 / SWR / Jest + Testing Library; Swift 6 / SwiftUI / iOS 18.2 / Swift Testing / xcodegen.

**Spec:** `docs/superpowers/specs/2026-10-08-ticketing-design.md` (read it first; section refs below are `§n`).

## Global Constraints

- Repos: `click-web` and `click-ios`, branch `feat/ticketing` in each (already created). Web PR first, then iOS.
- All ticketing routes return 403 `ticketing_disabled` while `TICKETING_ENABLED` isn't `true` (`requireTicketingEnabled()`), except `pass/scan` v1, which keeps working. Payload `ticketing` is `null` when the flag is off.
- Money is integer cents; currency `'usd'`. The buyer pays face value; the summary shows "Fees" as "None"; `feePolicy` v1 stays unchanged.
- Server is authoritative: clients send only tier ids + quantities; ownership comes from the authenticated user id; a 404 (not 403) for someone else's order or ticket.
- New SQL functions: `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO service_role`.
- Web files ≤ 1000 lines (`__tests__/sourceFileSize.test.ts`). New UI uses `components/ds`; no new near-duplicate primitives.
- Never apply migrations to production. Never read production data.
- Copy (exact): CTA `Get tickets` / `Claim free tickets` / `Checkout · $24.00`; owned `You have 2 tickets` (singular `You have 1 ticket`); unavailable `Sold out` / `Sales ended` / `On sale {Mon D}` / `Sales paused`; fees row `Fees` → `None`; editor toggle `Sell or hand out tickets`; payouts notice `Set up payouts to sell paid tickets`; return page `Confirming your payment…`, `No charge was made`, `Still confirming. We'll notify you when your tickets are ready. It's safe to leave this page.`; scanner `Refunded`, `Event cancelled`; banner `This event was cancelled`; iOS CTA `Get Tickets · from $12` (title case to match iOS buttons).
- QR: black on a fixed white tile in every color scheme, quiet zone ≥ 4 modules, rendered ≤ 300 px/pt and ≥ 200 px/pt on the smallest screen.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Web gates: `npm run typecheck && npm run lint && npm test && npm run build`. DB gate: `bash scripts/run-supabase-db-tests.sh` (needs `supabase start`). iOS gate: `xcodegen generate && xcodebuild test -project Click.xcodeproj -scheme ClickTests -destination 'platform=iOS Simulator,name=iPhone 16 Pro'`.

## Review Focus

1. **Stale event cache after sales changes:** `loadPublicEvent` is tag-cached (`eventCacheTag`). Every tier/status/cancel/fulfill/claim mutation must `revalidateTag(eventCacheTag(beaconId))`, or the event page keeps showing "Get tickets" after a cancel. Pinned in Tasks 5, 6 and 10.
2. **The same QR on two devices:** opening tickets on web then iOS must yield the identical `credential_url`, and both must scan. Pinned in Task 7 (`returns identical credentials on repeated reads`).
3. **Quantity above remaining when stock is low:** the picker must cap at `max_quantity`, and a 409 `insufficient_inventory` with `remaining` must clamp the selection, not just show an error. Pinned in Tasks 13 and 22.
4. **Checkout return before the webhook / user closes the return page:** tickets must still appear later with no client action; the polling must stop at 60 s without an error state. Pinned in Tasks 14 and 23.
5. **Manual lookup check-in for a ticket of another event:** `{ticket_id}` from a different event must return `wrong_event`, not check them in. Pinned in Task 9.

---

## Phase A — click-web (repo root `click-web/`)

### Task 1: Completion migration + pgTAP

**Files:**
- Create: `supabase/migrations/20261027000000_ticketing_completion.sql`
- Create: `supabase/tests/ticketing_completion.sql`

**Interfaces:**
- Produces (SQL, all service_role-only, all return `JSONB` with `ok` + `code` on failure, unless noted):
  - `ticketing_validate_items(p_buyer UUID, p_beacon UUID, p_items JSONB) → JSONB {ok, code?, subtotal?, tier_id?, remaining?}`. Locks the tiers (`ORDER BY id FOR UPDATE`), with the same per-item rules as today's reserve, plus `archived_at IS NULL`, plus `event_not_found` when `event_cancelled_at IS NOT NULL` → code `event_cancelled`. Event checks: `admission_type='ticketed'`, `ticketing_status='sales_open'`, event-level window.
  - `ticketing_reserve_order(...)`: same signature as today; calls the validator; requires a ready organizer only when `subtotal > 0`; rejects `subtotal = 0` with `use_free_claim`.
  - `ticketing_claim_free(p_buyer UUID, p_beacon UUID, p_items JSONB, p_tickets JSONB) → {ok, order_id, ticket_ids}`; rejects `subtotal > 0` with `not_free`. The order is inserted as `paid`/`fulfilled`, total 0, `organizer_payment_account_id NULL`, `fee_policy_snapshot '{}'`.
  - `ticketing_fulfill_order(...)`: same signature; the ticket insert now takes `id` from `p_tickets[].id`.
  - `ticketing_update_tier(p_tier UUID, p_patch JSONB) → {ok, code?}`; codes `tier_not_found`, `capacity_below_sold`, `price_kind_locked`, `invalid_window`.
  - `ticketing_cancel_event(p_beacon UUID) → {ok, refund_order_ids UUID[]}`; idempotent.
  - `ticketing_check_in(...)`: same signature; new results `refunded`, `event_cancelled`.
  - `ticketing_tier_counts(p_beacon UUID) RETURNS TABLE (tier_id UUID, sold INT, held INT, checked_in INT)`: sold = tickets in `valid`/`checked_in`; held = active unexpired holds.
  - Schema: `admission_type IN ('rsvp','ticketed')` default `'rsvp'` (existing `free`→`rsvp`, `paid`→`ticketed`); `map_beacons.event_cancelled_at`; `ticket_tiers.archived_at` + partial index `(beacon_id, sort_order) WHERE archived_at IS NULL`; `ticket_orders.organizer_payment_account_id` nullable + CHECK `(total_amount = 0 OR organizer_payment_account_id IS NOT NULL)`; `ticket_checkins.result` CHECK adds `'refunded','event_cancelled'`.

- [ ] **Step 1: Write the pgTAP test** `supabase/tests/ticketing_completion.sql` in the style of `supabase/tests/event_drops_security.sql` (BEGIN, `plan(n)`, fixture users/beacon/tiers via fixed UUIDs, ROLLBACK). Assertions:
  - existing rows keep admission `rsvp`; inserting `admission_type='paid'` raises `check_violation`
  - `authenticated` has no EXECUTE on any `ticketing_*` function
  - claim-free on a $0 tier with capacity 2: qty 2 → `ok`, 2 tickets `valid`, `beacon_attendees.source='ticket'`; the next claim qty 1 → `code = 'insufficient_inventory'`
  - claim-free on a paid tier → `not_free`; reserve on a free tier → `use_free_claim`
  - reserve on a paid tier with no ready account → `organizer_not_ready`
  - an archived tier → `tier_inactive` (archived is treated as inactive)
  - update tier capacity below sold → `capacity_below_sold`; price 0→500 after a sale → `price_kind_locked`
  - fulfill with a supplied ticket `id` stores that id; a second identical fulfill → `idempotent`
  - check-in: first → `accepted`, second → `already_checked_in`; refunded ticket → `refunded`; after `ticketing_cancel_event` a valid paid ticket → `event_cancelled`
  - cancel event: free tickets → `void`, ticket-sourced attendance removed, a `checkout_created` order → `canceled` with holds released, the paid order id is returned in `refund_order_ids`; a second call → same ids, `ok`
  - `ticketing_tier_counts` returns sold/held/checked_in matching the fixtures

- [ ] **Step 2: Run it to verify it fails**
  Run: `supabase start && bash scripts/run-supabase-db-tests.sh`
  Expected: FAIL in `ticketing_completion.sql` (functions/columns missing).

- [ ] **Step 3: Write the migration.** Move the validation loop out of `ticketing_reserve_order` (foundation lines 531–614) into `ticketing_validate_items`; `CREATE OR REPLACE` reserve, fulfill and check_in with their existing signatures. In `ticketing_check_in`, branch `status='refunded'` → `refunded`, then a cancelled event (checked before `valid`) → `event_cancelled`. Add `COMMENT ON` for each new object.

- [ ] **Step 4: Run it to verify it passes**
  Run: `bash scripts/run-supabase-db-tests.sh` — Expected: all files PASS (existing ones too).

- [ ] **Step 5: Concurrency check** — create `scripts/ticketing-race.sh` that, against local Supabase (`psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)"`), creates a capacity-1 free tier and runs two `ticketing_claim_free` calls in parallel (`&` + `wait`), then two `ticketing_check_in` calls on one ticket in parallel. Expected output: exactly one `"ok": true` claim and exactly one `accepted`. Run it; paste the output into the commit body.

- [ ] **Step 6: Commit** — `git add supabase/ scripts/ticketing-race.sh && git commit -m "feat(ticketing): completion migration — free claims, tier edits, event cancel"`

### Task 2: v2 ticket credentials

**Files:**
- Modify: `lib/events/eventPass.ts`, `lib/server/eventPass.ts`, `lib/server/ticketing/credentials.ts`, `lib/server/ticketing/fulfillment.ts`
- Test: `__tests__/lib/events/eventPass.test.ts` (extend if present, else create), `__tests__/lib/ticketing/credentials.test.ts`

**Interfaces:**
- Produces:
  - `mintTicketToken(key: Buffer, beaconId: string, ticketId: string): string` → `"2.{b64url(ticketUuidBytes)}.{b64url(hmac16)}"`, HMAC input `click-ticket:v2:{beacon}:{ticket}` (lowercased).
  - `verifyTicketToken(key: Buffer, beaconId: string, token: string): string | null` (ticket id).
  - `passTokenVersion(token: string): 1 | 2 | null`.
  - `issueTicketCredential(key: Buffer, beaconId: string, ticketId: string): IssuedPass` (in `lib/server/eventPass.ts`; same `{token,url,code}` shape as `issueEventPass`).
  - `mintTicketRow(key: Buffer, beaconId: string): { id: string; ticket_number: string; token_hash: string }` (credentials.ts; `id = randomUUID()`).
  - `buildTicketMints(admin, orderId, beaconId, key)` returns `{id, tier_id, ordinal, ticket_number, token_hash}[]` (exported for Task 6).
- Removes: `mintTicketCredential`, `ticketQrUrl`.

- [ ] **Step 1: Write failing tests**
  - `mintTicketToken → verifyTicketToken round-trips the ticket id`
  - `verifyTicketToken rejects: other beacon, flipped signature byte, v1 token, extra segment` (all `null`)
  - `verifyEventPassToken rejects a v2 token` and a v1 token still verifies (regression)
  - `passTokenVersion('1.x.y') === 1`, `('2.x.y') === 2`, `('junk') === null`
  - `mintTicketRow: token_hash === hashTicketToken(mintTicketToken(key, beacon, row.id))`
  - `eventPassCode works on v2 tokens` (format `/^[A-Z2-9]{3}-[A-Z2-9]{3}$/`)
- [ ] **Step 2: Run** `npx jest __tests__/lib/events/eventPass.test.ts __tests__/lib/ticketing/credentials.test.ts` — Expected: FAIL (not exported).
- [ ] **Step 3: Implement.** In `fulfillment.ts`, `buildTicketMints` takes `beaconId` and the key from `eventPassKey()` (throw `ticket_key_unavailable` if null, which makes the webhook 5xx and retry). The RPC payload adds `id`.
- [ ] **Step 4: Run** the same command — Expected: PASS. Also `npx jest __tests__/app/api` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ticketing): v2 ticket codes in Click Pass format`

### Task 3: Offerings domain module

**Files:**
- Create: `lib/ticketing/types.ts` (client-safe types), `lib/ticketing/money.ts`, `lib/server/ticketing/offerings.ts`
- Test: `__tests__/lib/ticketing/offerings.test.ts`, `__tests__/lib/ticketing/money.test.ts`

**Interfaces:**
- Produces (`lib/ticketing/types.ts`):
  ```ts
  export type TicketingStatus = 'draft' | 'ready' | 'sales_open' | 'sales_paused' | 'sales_closed';
  export type TierAvailability = 'on_sale' | 'sold_out' | 'not_started' | 'ended' | 'paused';
  export type TicketOffering = { id: string; name: string; description: string | null; unit_amount: number; currency: string;
    availability: TierAvailability; remaining: number | null; max_quantity: number; sales_start_at: string | null; sales_end_at: string | null };
  export type ManagedTier = TicketOffering & { capacity: number; sold: number; held: number; checked_in: number; is_active: boolean; max_per_order: number; sort_order: number };
  export type EventTicketing = { status: TicketingStatus; cancelled: boolean; from_amount: number | null; currency: string; available: boolean };
  export type TicketStatus = 'valid' | 'checked_in' | 'refunded' | 'void';
  ```
- Produces (`lib/ticketing/money.ts`): `formatMoney(cents: number, currency: string): string` (`0 → "Free"`, `1500 → "$15.00"`, `1250 → "$12.50"`); `formatFromPrice(cents: number, currency: string): string` (`1200 → "$12"` whole dollars when exact, else `"$12.50"`).
- Produces (`lib/server/ticketing/offerings.ts`):
  - `deriveOffering(tier: TierRow, counts: TierCounts, event: EventSalesRow, ownedForTier: number, nowMs: number): TicketOffering`
  - `loadTierCounts(admin, beaconId): Promise<Map<string, TierCounts>>` via `ticketing_tier_counts`
  - `loadOfferings(admin, beaconId, viewerId: string | null, nowMs: number): Promise<{ event: EventSalesRow; offerings: TicketOffering[] } | null>` (active, unarchived tiers, `sort_order`)
  - `loadManagedTiers(admin, beaconId, nowMs): Promise<ManagedTier[]>` (includes inactive, excludes archived)
  - `summarizeEventTicketing(event: EventSalesRow, offerings: TicketOffering[]): EventTicketing | null` (null unless `ticketingEnabled()` and `admission_type='ticketed'`)
  - `loadEventTicketing(admin, beaconId, nowMs): Promise<EventTicketing | null>`
  - `countMyLiveTickets(admin, beaconId, userId): Promise<number>`
  - Types `TierRow`, `TierCounts = {sold; held; checked_in}`, `EventSalesRow = {admission_type; ticketing_status; ticket_sales_start_at; ticket_sales_end_at; event_cancelled_at}`.

- [ ] **Step 1: Failing tests** for `deriveOffering` (table-driven, `nowMs` fixed):
  - paused event → `paused`; cancelled event → `ended`; event window not started → `not_started` and tier window not started → `not_started`; tier ended → `ended`
  - capacity 100, sold 90, held 0 → `on_sale`, `remaining 10`; sold 50 → `remaining null`; sold 98 held 2 → `sold_out`, `remaining 0`
  - `max_quantity = min(max_per_order 8, remaining 3, max_per_user 4 − owned 2)` → `2`; with no per-user limit → `3`; `sold_out` → `0`
  - `summarizeEventTicketing`: `from_amount` = min active price (0 when there's a free tier); `available` true iff any `on_sale`; null when flag off / `rsvp`
  - money cases listed above.
- [ ] **Step 2: Run** `npx jest __tests__/lib/ticketing` — Expected: FAIL.
- [ ] **Step 3: Implement.** Precedence for availability: cancelled/closed → `ended`; `sales_paused` or `draft`/`ready` → `paused`; then windows; then stock.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ticketing): shared offerings and availability`

### Task 4: `ticketing` in event payloads

**Files:**
- Modify: `lib/events/publicEvent.ts` (type + `loadPublicEventPayload`), `app/api/beacons/[beaconId]/route.ts` (GET), `__tests__/helpers/publicEventFixture.ts`
- Test: `__tests__/lib/events/publicEventTicketing.test.ts`, `__tests__/app/api/beacons.get.ticketing.test.ts`

**Interfaces:**
- Consumes: `loadEventTicketing`, `countMyLiveTickets` (Task 3).
- Produces: `PublicEventPayload.ticketing: EventTicketing | null` (viewer-agnostic, cached). `GET /api/beacons/:id` JSON adds `beacon.ticketing: (EventTicketing & { my_ticket_count: number }) | null` for event beacons.

- [ ] **Step 1: Failing tests:** payload has `ticketing: null` for an rsvp event and when the flag is off; a ticketed event with tiers $12/$25 → `from_amount 1200`; GET route includes `my_ticket_count` for the caller (fakeSupabase with 2 valid + 1 refunded ticket → `2`).
- [ ] **Step 2: Run** `npx jest __tests__/lib/events/publicEventTicketing.test.ts __tests__/app/api/beacons.get.ticketing.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Add `admission_type, ticketing_status, ticket_sales_start_at, ticket_sales_end_at, event_cancelled_at` to both selects; compute in parallel with existing loads. Update the fixture's default `ticketing: null`.
- [ ] **Step 4: Run** those plus `npx jest __tests__/lib/events __tests__/components/events` — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): expose ticketing state on event payloads`

### Task 5: Organizer tier and sales routes

**Files:**
- Modify: `app/api/beacons/[beaconId]/tickets/tiers/route.ts`, `app/api/beacons/[beaconId]/tickets/status/route.ts`, `lib/api/schemas/ticketing.ts`
- Create: `app/api/beacons/[beaconId]/tickets/tiers/[tierId]/route.ts`, `lib/server/ticketing/cache.ts`
- Test: `__tests__/app/api/ticketing.tiers.route.test.ts`, `__tests__/app/api/ticketing.status.route.test.ts`

**Interfaces:**
- Consumes: `loadOfferings`, `loadManagedTiers` (Task 3), `ticketing_update_tier` (Task 1).
- Produces:
  - `revalidateEventTicketing(beaconId: string): void` in `cache.ts` → `revalidateTag(eventCacheTag(beaconId))` + `revalidateTag(PUBLIC_EVENTS_TAG)`.
  - `GET …/tiers` → `{ tiers: TicketOffering[] }` (no auth required); `?manage=1` → `requireEventManager(..., {allowViewers:true})` → `{ tiers: ManagedTier[] }`.
  - `POST …/tiers` → 201 `{ tier_id }`; first tier on an `rsvp` event sets `admission_type='ticketed'`, `ticketing_status='draft'`.
  - `PATCH …/tiers/:tierId` body `updateTierBodySchema = createTierBodySchema.partial().extend({ is_active: z.boolean().optional() })` → 200 `{ ok: true }` | 409 `{ code }`.
  - `DELETE …/tiers/:tierId` → 200 `{ deleted: 'removed' | 'archived' }`.
  - `POST …/status` accepts `'disabled'` too; `disabled` → 409 `tickets_issued` if any ticket exists, else sets `admission_type='rsvp'`; `sales_open` requires payouts only when an active tier has `unit_amount > 0`.
- [ ] **Step 1: Failing tests** (pattern: `__tests__/app/api/ticketing.checkout.route.contract.test.ts`, mock `requireEventManager`): flag off → 403 for each verb; signed-out GET → 200 offerings; `?manage=1` non-manager → 403; PATCH → 409 `capacity_below_sold` passthrough; DELETE with order items → `archived`, without → `removed`; tier in another event → 404; status `sales_open` with only free tiers and no Stripe account → 200; with a paid tier and no account → 409 `organizer_not_ready`; `disabled` with tickets → 409 `tickets_issued`; every successful mutation calls `revalidateEventTicketing` (mock it).
- [ ] **Step 2: Run** `npx jest __tests__/app/api/ticketing.tiers.route.test.ts __tests__/app/api/ticketing.status.route.test.ts` — FAIL.
- [ ] **Step 3: Implement.** The tier must belong to `beaconId` (check before RPC). Validation: `sales_end_at > sales_start_at` (zod refine, code `invalid_window`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): organizer tier editing and sales lifecycle`

### Task 6: Checkout — free claims and the return URL

**Files:**
- Modify: `lib/server/ticketing/checkout.ts`, `app/api/beacons/[beaconId]/tickets/checkout/route.ts`, `lib/api/schemas/ticketing.ts`, `lib/server/ticketing/webhookHandlers.ts` (revalidate after fulfillment)
- Modify: `lib/events/eventUrls.ts`
- Test: `__tests__/app/api/ticketing.checkout.route.contract.test.ts` (extend), `__tests__/lib/ticketing/checkout.test.ts`

**Interfaces:**
- Consumes: `buildTicketMints`/`mintTicketRow` (Task 2), `ticketing_claim_free` (Task 1), `revalidateEventTicketing` (Task 5).
- Produces:
  - `eventTicketsReturnPath(beaconId: string, orderId: string, canceled?: boolean): string` → `/e/{id}/tickets/return?order={orderId}[&canceled=1]`.
  - `CheckoutResult` gains `{ ok: true; orderId: string; fulfilled: true }`.
  - Route response: paid `{ order_id, checkout_url }`; free `{ order_id, status: 'fulfilled' }`; mixed `400 { code: 'mixed_order' }`.
  - `checkoutBodySchema` gains `client: z.enum(['web','ios']).optional()` (sent to Stripe as metadata `click_client`).
- [ ] **Step 1: Failing tests:** all-$0 items → RPC `ticketing_claim_free` called with minted tickets (ids present), no Stripe call, response `status: 'fulfilled'`; mixed → 400 `mixed_order`; paid → Stripe `success_url` ends `/e/{id}/tickets/return?order={orderId}` and `cancel_url` ends `&canceled=1`; claim failure `insufficient_inventory` → 409 with `remaining`; the fulfillment webhook path calls `revalidateEventTicketing`.
- [ ] **Step 2: Run** `npx jest __tests__/app/api/ticketing.checkout.route.contract.test.ts __tests__/lib/ticketing/checkout.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Decide free vs paid from server-loaded `unit_amount`s, never from the client.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): instant free claims and a real checkout return URL`

### Task 7: Buyer read routes

**Files:**
- Modify: `app/api/beacons/[beaconId]/tickets/route.ts`, `app/api/orders/[orderId]/route.ts`
- Create: `app/api/me/tickets/route.ts`, `app/api/tickets/[ticketId]/route.ts`, `lib/server/ticketing/ownedTickets.ts`
- Test: `__tests__/app/api/ticketing.buyer.routes.test.ts`

**Interfaces:**
- Consumes: `issueTicketCredential`, `eventPassKey` (Task 2).
- Produces (`lib/ticketing/types.ts` additions):
  ```ts
  export type OwnedTicket = { id: string; beacon_id: string; order_id: string; status: TicketStatus; tier_name: string; ticket_number: string;
    issued_at: string; checked_in_at: string | null; credential_url: string | null; code: string | null };  // credential only when status==='valid' || 'checked_in'
  export type TicketEventRef = { beacon_id: string; title: string; start_at: string | null; end_at: string | null; timezone: string | null;
    location_name: string | null; image_url: string | null; visual_seed: string; cancelled: boolean };
  export type MyTicketsGroup = { event: TicketEventRef; tickets: OwnedTicket[] };
  export type OrderSummary = { id: string; items: { tier_name: string; quantity: number; unit_amount: number }[]; subtotal_amount: number;
    platform_fee_amount: 0; total_amount: number; currency: string; paid_at: string | null; refunded_amount: number };
  ```
  (`platform_fee_amount` shown to buyers is always 0 because the organizer absorbs it; the real fee is never exposed to buyers.)
  - `listOwnedTickets(admin, userId, opts: { beaconId?: string; ticketId?: string }): Promise<OwnedTicket[]>`
  - `GET /api/beacons/:id/tickets` → `{ tickets: OwnedTicket[] }`; `GET /api/me/tickets?scope=upcoming|past` → `{ groups: MyTicketsGroup[] }` (upcoming = end (or start+6h) ≥ now, sorted soonest first; past sorted latest first); `GET /api/tickets/:id` → `{ ticket: OwnedTicket, event: TicketEventRef, order: OrderSummary }`; `GET /api/orders/:id` adds `beacon_id`, `ticket_count`.
- [ ] **Step 1: Failing tests:** `returns identical credentials on repeated reads` (two GETs → same `credential_url`, and no `tickets` UPDATE issued); a refunded ticket has `credential_url: null`; another user's ticket → 404; signed out → 401; upcoming/past split around a fixed `Date.now` (jest fake timers); the order summary hides the real platform fee.
- [ ] **Step 2: Run** `npx jest __tests__/app/api/ticketing.buyer.routes.test.ts` — FAIL.
- [ ] **Step 3: Implement** with one joined select (`tickets` → `ticket_tiers(name)`, `map_beacons(...)`), no per-row queries.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): buyer ticket and wallet APIs with stable credentials`

### Task 8: Organizer summary and attendees

**Files:**
- Create: `app/api/beacons/[beaconId]/tickets/summary/route.ts`, `app/api/beacons/[beaconId]/tickets/attendees/route.ts`, `lib/server/ticketing/organizer.ts`
- Test: `__tests__/app/api/ticketing.organizer.routes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TicketSalesSummary = { sold: number; capacity: number; checked_in: number; gross_cents: number; refunded_cents: number;
    net_cents: number; currency: string; tiers: { id: string; name: string; sold: number; capacity: number; unit_amount: number }[] };
  export type TicketAttendee = { ticket_id: string; order_id: string; user_id: string; name: string; avatar_url: string | null;
    tier_name: string; status: TicketStatus; checked_in_at: string | null; ticket_number: string; refundable: boolean };
  ```
  - `loadSalesSummary(admin, beaconId): Promise<TicketSalesSummary>`. gross = Σ `total_amount` of orders in (`paid`,`partially_refunded`,`refunded`,`disputed`); refunded = Σ succeeded `ticket_refunds.amount`; net = gross − refunded − Σ `platform_fee_amount` of those orders (the fee is refunded proportionally by Stripe, so subtract the fee only for non-refunded value: `platform_fee_amount * (1 − refunded/total)`, rounded).
  - `searchAttendees(admin, beaconId, q: string, cursor: string | null): Promise<{ attendees: TicketAttendee[]; next_cursor: string | null }>` — 50/page ordered by `issued_at, id`; `q` is matched case-insensitively against holder name (resolve matching user ids from `users` first, then filter tickets) or exactly against `ticket_number`.
  - Routes `GET …/summary`, `GET …/attendees?q=&cursor=`, both `requireEventManager(…, {allowViewers:true})`. `refundable` is true only for `access==='manage'` and a paid ticket with status `valid`/`checked_in`.
- [ ] **Step 1: Failing tests:** summary math for 3 paid orders ($15×2, $25, $0 free) and one $15 refund → gross 5500, refunded 1500, net per formula; viewer access sees `refundable:false`; non-manager → 403; search by name and by `CLK-` number; cursor pagination returns `next_cursor` when 51 rows.
- [ ] **Step 2: Run** `npx jest __tests__/app/api/ticketing.organizer.routes.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): organizer sales summary and attendee search`

### Task 9: Unified door check-in

**Files:**
- Create: `lib/server/events/doorCheckIn.ts`
- Modify: `app/api/beacons/[beaconId]/pass/scan/route.ts`, `lib/api/schemas/beacons.ts` (`passScanBodySchema`)
- Delete: `app/api/beacons/[beaconId]/tickets/check-in/route.ts`
- Test: `__tests__/app/api/passScan.route.test.ts` (extend if present, else create)

**Interfaces:**
- Produces:
  - `recordDoorCheckIn(admin, args: { beaconId: string; userId: string; venueId: string | null; scannedBy: string; source: 'pass_scan' | 'ticket_scan' }): Promise<{ checkedInAt: string; hereNow: number }>` — the event_check_ins upsert, engagement event, hub grant and live count lifted from the current route.
  - `passScanBodySchema = z.union([z.object({ credential: z.string().min(8).max(512) }), z.object({ ticket_id: z.string().uuid() })])`.
  - Response: `{ result: 'checked_in' | 'already_checked_in' | 'not_going' | 'wrong_event' | 'invalid' | 'refunded' | 'event_cancelled', attendee, checked_in_at, check_in_count?, tier_name? }` (the RPC's `accepted` maps to `checked_in`; `void` maps to `invalid`).
- [ ] **Step 1: Failing tests:** v1 pass behaves exactly as before (existing cases still pass); a v2 token for this event → RPC called with `hashTicketToken(token)` → `checked_in` + `tier_name` + `recordDoorCheckIn` called with `source:'ticket_scan'`; a v2 token with a bad signature → `invalid` without an RPC call; `{ticket_id}` of another event → `wrong_event` and no RPC; refunded → `refunded`; v2 with the flag off → `invalid`; the old `/tickets/check-in` module no longer exists (`expect(() => require(...)).toThrow()`).
- [ ] **Step 2: Run** `npx jest __tests__/app/api/passScan.route.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Dispatch by `passTokenVersion`. For `{ticket_id}`, load `qr_token_hash, beacon_id` by id; a mismatched beacon → `wrong_event`.
- [ ] **Step 4: Run** — PASS, and `grep -rn "tickets/check-in" app lib components docs` returns only the `docs/ticketing.md` line you update in Task 20.
- [ ] **Step 5: Commit** `feat(ticketing): one door scanner for Click Passes and tickets`

### Task 10: Cancel event, delete guard, refund retry

**Files:**
- Create: `app/api/beacons/[beaconId]/cancel/route.ts`, `lib/server/ticketing/cancelEvent.ts`
- Modify: `app/api/beacons/[beaconId]/route.ts` (DELETE), `app/api/cron/ticketing-expiry/route.ts`
- Test: `__tests__/app/api/ticketing.cancel.route.test.ts`

**Interfaces:**
- Consumes: `ticketing_cancel_event` (Task 1), `requestTicketRefund` (existing), `revalidateEventTicketing` (Task 5).
- Produces: `cancelTicketedEvent(admin, beaconId, actorUserId): Promise<{ refunds_started: number; refunds_failed: number }>`; `retryCancelledEventRefunds(admin): Promise<number>`; `POST /api/beacons/:id/cancel` (manage only) → 200 `{ refunds_started, refunds_failed }`; DELETE → 409 `{ code: 'has_ticket_orders' }` when any `ticket_orders` row exists.
- [ ] **Step 1: Failing tests:** cancel calls the RPC then `requestTicketRefund` once per returned order; one refund throws → `refunds_failed: 1`, still 200, and the others continue; a second cancel is idempotent (Stripe refunds use the same idempotency key, so the mock sees identical keys); the cron route calls `retryCancelledEventRefunds`; DELETE with orders → 409, without → existing behavior; viewer access → 403; the cache is revalidated.
- [ ] **Step 2: Run** `npx jest __tests__/app/api/ticketing.cancel.route.test.ts` — FAIL.
- [ ] **Step 3: Implement** (refunds sequential, at most 100 per request; the remainder is left for the cron).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): cancel ticketed events with automatic refunds`

### Task 11: Apple Wallet for tickets

**Files:**
- Modify: `app/api/beacons/[beaconId]/pass/wallet/route.ts`, `lib/server/eventPass.ts` (`walletPassJson` gains `ticket?: { id: string; tierName: string }`)
- Test: `__tests__/lib/server/walletPassJson.test.ts` (extend or create)

**Interfaces:**
- Produces: `GET …/pass/wallet?ticket={id}` → pkpass for an owned live ticket (else 404); with a ticket, `serialNumber = ticketId`, barcode message = the v2 URL, an auxiliary field `{key:'ticket', label:'TICKET', value: tierName}`.
- [ ] **Step 1: Failing test:** `walletPassJson` with `ticket` sets the serial to the ticket id and adds the TICKET field; without it, the output is unchanged (snapshot of the existing shape).
- [ ] **Step 2: Run** `npx jest __tests__/lib/server/walletPassJson.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): Apple Wallet passes for tickets`

### Task 12: Web ticketing client

**Files:**
- Create: `lib/ticketing/ticketingClient.ts`
- Test: `__tests__/lib/ticketing/ticketingClient.test.ts`

**Interfaces:**
- Produces (all use `getFreshAuthHeaders()`, `credentials:'include'`, `cache:'no-store'`; throw `TicketingError { status: number; code: string | null; remaining?: number }` on non-2xx):
  `offeringsUrl(beaconId)`, `fetchOfferings(url): Promise<TicketOffering[]>`, `startCheckout(beaconId, items: {ticket_tier_id: string; quantity: number}[]): Promise<{ order_id: string; checkout_url?: string; status?: 'fulfilled' }>`, `fetchOrder(orderId): Promise<OrderProjection>`, `fetchEventTickets(beaconId): Promise<OwnedTicket[]>`, `fetchMyTickets(scope: 'upcoming'|'past'): Promise<MyTicketsGroup[]>`, `fetchManagedTiers`, `createTier`, `updateTier`, `deleteTier`, `setTicketingStatus`, `fetchSalesSummary`, `searchAttendees`, `refundOrder(orderId, ticketIds?: string[])`, `cancelEvent(beaconId)`, `connectOnboardingUrl(): Promise<string>`.
  `OrderProjection = { id; beacon_id; order_state: string; fulfillment_state: string; total_amount: number; ticket_count: number }`.
  `orderOutcome(o: OrderProjection): 'confirmed' | 'pending' | 'canceled' | 'failed' | 'expired'` (`paid`+`fulfilled` → confirmed; `reserved|checkout_created|payment_processing` or `paid`+unfulfilled → pending; `canceled` → canceled; `payment_failed` → failed; `expired` → expired).
  `ticketingErrorMessage(e: TicketingError): string` → `insufficient_inventory` "Only {n} left. We updated your selection." / "Sold out."; `price_changed` "The price changed. Check the new total."; `sales_ended`/`sales_not_open` "Sales for this event have closed."; `over_user_limit` "You've reached the ticket limit for this event."; network → "Check your connection and try again."
- [ ] **Step 1: Failing tests:** `orderOutcome` table; `TicketingError` parses `{code, remaining}` from a 409; message mapping.
- [ ] **Step 2: Run** `npx jest __tests__/lib/ticketing/ticketingClient.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): web client for ticketing APIs`

### Task 13: Event page ticket card

**Files:**
- Create: `components/events/tickets/TicketPurchaseCard.tsx`, `components/events/tickets/QuantityStepper.tsx`, `lib/ticketing/selection.ts`
- Modify: `components/events/EventPageView.tsx` (render the card instead of `EventRsvpCard` when `event.ticketing`; cancelled banner), `app/(app)/e/[beaconId]/page.tsx` (pass `myTicketCount` from `countMyLiveTickets` for the signed-in viewer)
- Test: `__tests__/lib/ticketing/selection.test.ts`, `__tests__/components/events/TicketPurchaseCard.test.tsx`

**Interfaces:**
- Consumes: Task 12 client, Task 3 types/money.
- Produces: `selection.ts` — `type Selection = Record<string, number>`; `clampSelection(sel, offerings): Selection` (drops unavailable, caps at `max_quantity`); `selectionTotal(sel, offerings): { lines: {name; quantity; amount}[]; total: number; isFree: boolean; count: number }`; `ctaLabel(total: {total; isFree; count}, currency): string`.
  `TicketPurchaseCard({ beaconId, ticketing: EventTicketing, myTicketCount: number, signedIn: boolean, initialOfferings?: TicketOffering[] })`.
- [ ] **Step 1: Failing tests:**
  - selection: clamping to `max_quantity`, dropping sold-out, totals, `ctaLabel` → `Get tickets` (nothing selected), `Claim free tickets`, `Checkout · $24.00`
  - card: one offering → a single stepper with no tier rows; two offerings → two rows; a sold-out row shows `Sold out` with a disabled stepper; `not_started` shows `On sale Oct 3`; a 409 `insufficient_inventory` `remaining:1` → refetches, clamps to 1, shows the notice; signed out → CTA links to `loginHref(eventSharePath(id))`; `myTicketCount 2` → `You have 2 tickets` link to `eventPassPath`; free success → `router.push(eventPassPath)`; paid → `window.location.assign(checkout_url)`; the CTA is disabled and loading while the request is in flight (no double submit).
- [ ] **Step 2: Run** `npx jest __tests__/lib/ticketing/selection.test.ts __tests__/components/events/TicketPurchaseCard.test.tsx` — FAIL.
- [ ] **Step 3: Implement** with SWR (`offeringsUrl`, `revalidateOnFocus: true`), `ListGroup` rows, `Button` primary `lg` full-width CTA, a summary block (`type-meta` labels, tabular numbers), `InlineNotice` for errors. Stepper: `IconButton` minus/plus with 44 px targets, `aria-label` "Fewer {name}" / "More {name}", value `aria-live="polite"`. Layout must not overflow at 320 px.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): ticket selection on the event page`

### Task 14: Checkout return page

**Files:**
- Create: `app/(app)/e/[beaconId]/tickets/return/page.tsx`, `components/events/tickets/CheckoutReturn.tsx`
- Test: `__tests__/components/events/CheckoutReturn.test.tsx`

**Interfaces:**
- Consumes: `fetchOrder`, `orderOutcome` (Task 12).
- Produces: `CheckoutReturn({ beaconId, orderId, canceledParam: boolean })`. Polls with SWR `refreshInterval` 1s for the first 10 s, then 3 s, stopping at 60 s or on a terminal outcome; `canceledParam` and a pending order → show `No charge was made` immediately (still a single fetch to confirm it isn't paid).
- [ ] **Step 1: Failing tests (fake timers):** confirmed → `router.replace(eventPassPath(id))`; pending past 60 s → the "Still confirming…" copy, polling stopped, no error styling; canceled → `No charge was made` + `Back to event`; failed/expired → `Try again` linking to the event; 404 → "We couldn't find this order." The page redirects signed-out users to `loginHref`.
- [ ] **Step 2: Run** `npx jest __tests__/components/events/CheckoutReturn.test.tsx` — FAIL.
- [ ] **Step 3: Implement** (centered `max-w-[440px]` column, `Spinner` + `type-title-3` status, `EmptyState` for terminal non-success).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): checkout return page that waits for the webhook`

### Task 15: Tickets on the pass page

**Files:**
- Modify: `components/events/ClickPassView.tsx`, `app/(app)/e/[beaconId]/pass/page.tsx`, `lib/events/eventPassClient.ts`
- Create: `components/events/tickets/TicketPager.tsx`, `components/events/tickets/OrderDetails.tsx`
- Test: `__tests__/components/events/ClickPassView.tickets.test.tsx`

**Interfaces:**
- Consumes: `listOwnedTickets` (server, Task 7), `fetchEventTickets`, `GET /api/tickets/:id` (order details on expand).
- Produces: `ClickPassState` gains `{ kind: 'tickets'; tickets: OwnedTicket[] }`; the page chooses `tickets` when `event.ticketing` and the viewer owns ≥ 1 ticket, `not_going`→ "Get tickets" CTA when ticketed with none; `?ticket={id}` selects the initial page.
- [ ] **Step 1: Failing tests:** 3 tickets → `1 of 3` with next/prev buttons and swipe-free keyboard support (←/→); a `refunded` ticket shows `Refunded` and no QR (`queryByTestId('pass-qr')` null); a `checked_in` ticket shows the QR at full contrast with `Checked in at 8:04 PM`; a cancelled event shows `This event was cancelled` instead of the QR for all tickets; `OrderDetails` is collapsed by default and lazy-loads; the wallet button link carries `?ticket={id}`; the RSVP pass mode renders unchanged (existing tests pass).
- [ ] **Step 2: Run** `npx jest __tests__/components/events/ClickPassView` — FAIL.
- [ ] **Step 3: Implement.** Keep `ClickPassView.tsx` < 1000 lines by putting the ticket UI in `TicketPager.tsx`; reuse the existing QR tile element.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): show tickets on the pass page`

### Task 16: Ticket wallet page

**Files:**
- Create: `app/(app)/tickets/page.tsx`, `components/events/tickets/TicketWallet.tsx`
- Modify: the Me menu (find with `grep -rn "'/me'\|\"/me\"" components/app-shell | head`) to add a `Tickets` item with the `Ticket` lucide icon; `components/events/YourEventsStrip.tsx` adds a `Your tickets` link when the user has any upcoming ticket; `lib/shell/appNav.ts` `activeAppSection('/tickets') === 'me'`
- Test: `__tests__/components/events/TicketWallet.test.tsx`, `__tests__/lib/shell/appNav.test.ts` (extend)

**Interfaces:**
- Consumes: `fetchMyTickets` (Task 12).
- Produces: `TicketWallet({ initialScope: 'upcoming' | 'past' })`, scope in the `?scope=` query.
- [ ] **Step 1: Failing tests:** the SegmentedControl switches scope and URL; a row shows the event title, date line, `{n} tickets · {tier}`, and links to `eventPassPath(id)`; empty upcoming → EmptyState with `Browse events` → `/events`; a cancelled event row shows a `Cancelled` StatusPill; `activeAppSection('/tickets')` → `'me'`.
- [ ] **Step 2: Run** `npx jest __tests__/components/events/TicketWallet.test.tsx __tests__/lib/shell/appNav.test.ts` — FAIL.
- [ ] **Step 3: Implement** (reuse `EventRow`; server page loads the first scope for first paint).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): ticket wallet`

### Task 17: Ticketing section in the event editor

**Files:**
- Create: `components/events/tickets/TicketingSection.tsx`, `components/events/tickets/TicketTierSheet.tsx`, `lib/ticketing/tierForm.ts`
- Modify: `components/events/EventForm.tsx` (mount after `OptionsGroup`; in create mode, after a successful POST, persist drafted tiers then status)
- Test: `__tests__/lib/ticketing/tierForm.test.ts`, `__tests__/components/events/TicketingSection.test.tsx`

**Interfaces:**
- Consumes: Task 12 tier/status/onboarding client functions; `ManagedTier`.
- Produces: `tierForm.ts` — `type TierDraft = { name: string; description: string; priceText: string; capacityText: string; maxPerOrderText: string; salesStart: WallClock | null; salesEnd: WallClock | null }`; `validateTierDraft(d: TierDraft, ctx: { sold: number; timeZone: string; wasPaid: boolean | null }): { errors: Partial<Record<'name'|'price'|'capacity'|'maxPerOrder'|'window', string>>; body: CreateTierBody | null }` with messages: name empty → "Name your ticket"; price not money → "Enter a price like 15 or 15.00"; capacity < 1 → "Capacity must be at least 1"; capacity < sold → "{sold} already sold, so capacity can't go lower"; free↔paid after sales → "This ticket has sales, so it can't switch between free and paid"; end ≤ start → "Sales must end after they start"; maxPerOrder outside 1–20 → "Choose 1 to 20".
  `TicketingSection({ beaconId?: string; timeZone: string; hasPaidAccount: boolean | null; onDraftsChange?(drafts: TierDraft[]): void })` — controlled draft list in create mode; live API in edit mode.
- [ ] **Step 1: Failing tests:** `validateTierDraft` cases above; `$15` and `15.5` parse to 1500/1550; the section toggle starts off on a new event and shows rows on an event with tiers; Add opens the sheet; Save in edit mode PATCHes and toasts `Ticket saved`; a row with sales shows `Hide` instead of `Delete`; a paid tier and `hasPaidAccount:false` shows the `Set up payouts to sell paid tickets` notice whose button calls `connectOnboardingUrl`; the sales state SegmentedControl (Open/Paused/Closed) calls `setTicketingStatus`; the toggle is disabled with the explanation "Tickets have been issued, so ticketing can't be turned off" once sold > 0.
- [ ] **Step 2: Run** `npx jest __tests__/lib/ticketing/tierForm.test.ts __tests__/components/events/TicketingSection.test.tsx` — FAIL.
- [ ] **Step 3: Implement** with `Toggle`, `ListGroup` rows (`name`, `formatMoney`, `{remaining} / {capacity} left`, `Sales end {date}`, `StatusPill`), `Sheet` with `TextField`s and the existing date/time inputs from `WhenGroup`, `ConfirmDialog` for delete. In `EventForm`, create mode: after the event is created, sequentially `createTier` each draft, then `setTicketingStatus('sales_open')` if all free or payouts are ready, else `'draft'` and toast "Event created. Set up payouts to open ticket sales."; any tier failure → navigate to the manage Tickets tab with an error toast (the event exists; don't strand the user on the form).
- [ ] **Step 4: Run** — PASS, plus `npx jest __tests__/components/events/EventForm` (no regressions).
- [ ] **Step 5: Commit** `feat(ticketing): ticket setup in the event editor`

### Task 18: Organizer Tickets tab

**Files:**
- Create: `components/events/manage/ManageTickets.tsx`, `components/events/manage/TicketAttendeeList.tsx`
- Modify: `app/(app)/e/[beaconId]/manage/[[...tab]]/page.tsx` (`TABS` adds `"tickets"`, title `Tickets`), `components/events/manage/ManageHeader.tsx` (tab shown only when `event.ticketing`), `components/events/manage/ManageOverview.tsx` (summary card with the three StatTiles linking to the tab), `__tests__/components/events/manage/manageTabs.test.tsx`
- Test: `__tests__/components/events/manage/ManageTickets.test.tsx`

**Interfaces:**
- Consumes: `loadSalesSummary`, `searchAttendees` (Task 8, server-side for first paint), `searchAttendees`/`refundOrder`/`cancelEvent` client (Task 12), `POST pass/scan {ticket_id}` for manual check-in.
- Produces: `ManageTickets({ beaconId, access, summary: TicketSalesSummary, initialAttendees, cancelled: boolean })`.
- [ ] **Step 1: Failing tests:** StatTiles `87 / 120` sold, `42` checked in, `$1,305` gross; per-tier rows; search debounced 250 ms calls `searchAttendees`; row menu `Check in` → scan with `ticket_id` → row becomes `Checked in`; `Refund ticket` → ConfirmDialog "Refund $15.00 to Alex Chen? Their ticket stops working right away." → `refundOrder(orderId, [ticketId])`; `access:'view'` shows no menu and no Cancel; `Cancel event` ConfirmDialog copy "Cancel this event? Everyone's tickets stop working and all {n} paid orders are refunded in full." then the result toast "Event cancelled. {refunds_started} refunds started." (+ " {refunds_failed} will retry automatically." when > 0); the tab is hidden for rsvp events.
- [ ] **Step 2: Run** `npx jest __tests__/components/events/manage` — FAIL.
- [ ] **Step 3: Implement** (`StatTile`, `ListGroup`, `SearchField`, `PersonRow`, `StatusPill`, `Menu`, `ConfirmDialog`, `Button href={eventScanPath}` "Open scanner"; load-more button for `next_cursor`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): organizer tickets dashboard`

### Task 19: Scanner results and guest lookup

**Files:**
- Modify: `components/events/PassScanner.tsx`, `app/(app)/e/[beaconId]/scan/page.tsx` (pass `ticketed: boolean`)
- Create: `components/events/tickets/GuestLookupSheet.tsx`
- Test: `__tests__/components/events/PassScanner.test.tsx` (extend or create)

**Interfaces:**
- Consumes: Task 9 response shape; `searchAttendees` (Task 12).
- Produces: `PassScanner` props add `ticketed: boolean`; title `Scan Tickets` when ticketed, idle hint "Guests find their ticket on the event page."; `look()` handles `refunded` (destructive, `Refunded`, "This ticket was refunded.") and `event_cancelled` (destructive, `Event cancelled`); shows `tier_name` under the holder's name; a `Look up guest` button (bottom bar, 44 px) opens `GuestLookupSheet({ beaconId, onResult(scan) })`, which checks in by `ticket_id` and feeds the same outcome card; the camera keeps running underneath.
- [ ] **Step 1: Failing tests:** each new result renders its title; tier name renders; lookup → check-in → outcome card shows `Checked in`; the existing scanner tests still pass.
- [ ] **Step 2: Run** `npx jest __tests__/components/events/PassScanner.test.tsx` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): ticket results and guest lookup in the door scanner`

### Task 20: Docs, full gates, visual pass, end-to-end, PR

**Files:**
- Modify: `docs/ticketing.md` (API table, free claims, v2 codes, cancel flow, removed routes, launch checklist), `.env.example` if `TICKETING_ENABLED` is missing there

- [ ] **Step 1:** Update the docs; `grep -rn "tickets/check-in\|/t/\|include_credential" docs lib app` → no stale references.
- [ ] **Step 2: Gates.** Run `npm run typecheck && npm run lint && npm test && npm run build` and `bash scripts/run-supabase-db-tests.sh`. Expected: all green. Fix any failure, re-run.
- [ ] **Step 3: Visual pass** with the esbuild + headless Chrome harness (see memory "Click web visual check"), with fixture data, at 320 / 390 / 768 / 1280 px, light and dark: event page (rsvp event unchanged; ticketed with 1 tier, 3 tiers incl. sold out, owned, cancelled), return page (each outcome), pass page with 3 tickets + refunded, wallet (both scopes + empty), editor section + tier sheet, manage Tickets tab, scanner outcome + lookup sheet. Fix anything clipped, overflowing, misaligned, or low-contrast; re-shoot.
- [ ] **Step 4: End-to-end (Stripe test mode)** — only if `STRIPE_SECRET_KEY` starts with `sk_test_` locally and the `stripe` CLI is logged in; otherwise record "E2E skipped: no Stripe test keys" in the PR. With `supabase start`, `TICKETING_ENABLED=true npm run dev`, `stripe listen --forward-to localhost:3000/api/webhooks/stripe`: create an event with a free and a $12 tier → claim free → buy $12 with `4242 4242 4242 4242` → the ticket appears on `/tickets` → scan it at `/e/{id}/scan` (paste the credential via the lookup) → `Checked in` → refund from the Tickets tab → pass page shows `Refunded`; also `4000 0000 0000 0002` (declined) and cancelling on Stripe → `No charge was made`; `stripe events resend <evt>` for `checkout.session.completed` → no duplicate tickets.
- [ ] **Step 5: Commit + PR.** `git push -u origin feat/ticketing && gh pr create --base main --title "Ticketing: complete web ticketing" --body …` (summary, test results, E2E status, migration note "apply with `npm run db:migrate` before enabling `TICKETING_ENABLED`", ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).

---

## Phase B — click-ios (repo root `click-ios/`)

After adding any new Swift file run `xcodegen generate`. Test style: Swift Testing (`@Suite`, `@Test`, `#expect`) as in `Tests/ClickTests/EventDetailTests.swift`; HTTP stubs as in `DropsMockURLProtocol` (`Tests/ClickTests/ClickDropDevelopTests.swift`).

### Task 21: Ticketing models and repository

**Files:**
- Create: `Click/Core/Beacons/Ticketing.swift` (models), `Click/Core/Beacons/TicketingRepository.swift`
- Modify: `Click/Core/Beacons/MapBeacon.swift` (`public var ticketing: EventTicketing? = nil`, decoded from `row["ticketing"]`), `Click/App/AppEnvironment.swift` (`let ticketing: TicketingRepository`)
- Test: `Tests/ClickTests/TicketingTests.swift`

**Interfaces:**
- Produces (Swift, `public`, `Equatable, Sendable, Codable` where data):
  - `EventTicketing { status: String; cancelled: Bool; fromAmount: Int?; currency: String; available: Bool; myTicketCount: Int }`
  - `TicketOffering { id, name, description: String?, unitAmount: Int, currency, availability: Availability (.onSale, .soldOut, .notStarted, .ended, .paused), remaining: Int?, maxQuantity: Int, salesStartAt: Date? }`
  - `OwnedTicket { id, beaconID, orderID, status: TicketStatus (.valid, .checkedIn, .refunded, .void), tierName, ticketNumber, checkedInAt: Date?, credentialURL: String?, code: String? }`
  - `TicketOrder { id, beaconID, outcome: OrderOutcome (.confirmed, .pending, .canceled, .failed, .expired), ticketCount: Int }` — the same mapping as web `orderOutcome`.
  - `CheckoutStart` enum: `.fulfilled(orderID: String)`, `.checkout(orderID: String, url: URL)`
  - `TicketingError: LocalizedError { code: String?; remaining: Int? }` with the web Task 12 messages.
  - `TicketingRepository(api: ClickAPIClient)`: `offerings(beaconID:) async throws -> [TicketOffering]`, `startCheckout(beaconID:items: [(tierID: String, quantity: Int)]) async throws -> CheckoutStart` (sends `client: "ios"`), `order(id:) async throws -> TicketOrder`, `eventTickets(beaconID:) async throws -> [OwnedTicket]`, `myTickets(scope: TicketScope) async throws -> [MyTicketsGroup]`, `nonisolated cachedEventTickets(beaconID:) -> (tickets: [OwnedTicket], fetchedAt: Date)?`; persisted per user via `LocalStore` like `EventEngagementRepository.Persisted`.
- [ ] **Step 1: Failing tests:** `MapBeacon.decode` with and without `ticketing`; offering decoding of each availability string (unknown → `.paused`); order outcome mapping table; `startCheckout` parses both response shapes and posts `client: "ios"`; a 409 body `{code:"insufficient_inventory",remaining:1}` → `TicketingError(code:…, remaining: 1)`; cached tickets survive a repository re-init for the same user and are absent for another user.
- [ ] **Step 2: Run** `xcodegen generate && xcodebuild test -project Click.xcodeproj -scheme ClickTests -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:ClickTests/TicketingTests` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): iOS ticketing models and repository`

### Task 22: Event screen CTA and ticket picker

**Files:**
- Create: `Click/Features/Events/Tickets/TicketButton.swift`, `Click/Features/Events/Tickets/TicketPickerSheet.swift`, `Click/Features/Events/Tickets/TicketPickerModel.swift`
- Modify: `Click/Features/Events/BeaconDetailView.swift` (lines ~128–130: `if let ticketing = beacon.ticketing { TicketButton(...) } else if beacon.rsvpEnabled != false … rsvpButton`; `passCard` title `Your tickets · \(n)` when ticketed; a cancelled banner under the title using the `isExpired` label style)
- Test: `Tests/ClickTests/TicketPickerTests.swift`

**Interfaces:**
- Consumes: Task 21.
- Produces: `@Observable final class TicketPickerModel` — `offerings`, `selection: [String: Int]`, `phase: .loading | .ready | .submitting | .failed(String)`, `notice: String?`, `func load() async`, `func increment(_ id)`, `func decrement(_ id)`, `var total: Int`, `var isFree: Bool`, `var ctaTitle: String` (`Get Tickets` / `Claim Free Tickets` / `Checkout · $24.00`), `func submit() async -> CheckoutStart?` (on 409 reloads offerings, clamps, sets `notice`). `TicketButton(beacon:)` titles: `Get Tickets · from $12`, `Claim Free Tickets`, `Sold Out`, `Sales Ended`, `Event Cancelled` (disabled for the last three).
- [ ] **Step 1: Failing tests (model only, stubbed repo):** increments cap at `maxQuantity`; sold-out rows can't increment; total/ctaTitle; a 409 with remaining 1 clamps selection to 1 and sets the notice; a network failure keeps the selection and sets `.failed`; double `submit` while submitting is ignored.
- [ ] **Step 2: Run** the `-only-testing:ClickTests/TicketPickerTests` command — FAIL.
- [ ] **Step 3: Implement.** Sheet: `.presentationDetents([.medium, .large])`, rows with `Stepper`-style ± buttons (44 pt, `accessibilityLabel` "More {name}" / "Fewer {name}"), unavailable rows at secondary color with the reason, a summary card (`detailCard()` style), primary button in the existing RSVP button style, `.sensoryFeedback(.selection, trigger:)` on quantity changes, Dynamic Type safe (no fixed heights).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): native ticket picker on the event screen`

### Task 23: Checkout handoff and order confirmation

**Files:**
- Create: `Click/Features/Events/Tickets/TicketCheckout.swift`, `Click/Features/Events/Tickets/OrderConfirmationView.swift`
- Modify: `Click/Core/Auth/GoogleSignIn.swift` (extract the presentation-anchor provider into `Click/Core/Auth/WebAuthPresenter.swift` and reuse it in both; no behavior change)
- Test: `Tests/ClickTests/TicketCheckoutTests.swift`

**Interfaces:**
- Consumes: Tasks 21–22.
- Produces: `enum TicketCheckout { static func run(url: URL, beaconID: String) async throws -> CheckoutReturn }` where `CheckoutReturn = .completed(orderID) | .canceled` — `ASWebAuthenticationSession(url:callback: .https(host: "joinclick.co", path: "/e/\(beaconID)/tickets/return"))`, `prefersEphemeralWebBrowserSession = false`; user cancel → `.canceled`; the callback URL with `canceled=1` → `.canceled`. `@Observable final class OrderConfirmationModel(orderID:)` — polls `order(id:)` every 1 s for 10 s then every 3 s, stopping at 60 s; `state: .confirming | .confirmed | .canceled | .failed | .stillConfirming`. On `.confirmed`: refresh beacon + tickets, then `router.navigate(to: .eventPass(beaconID:))`.
- [ ] **Step 1: Failing tests:** callback parsing (`?order=X` → `.completed("X")`, `&canceled=1` → `.canceled`); the polling model with an injected clock/sequence: pending×3 then confirmed → `.confirmed`; pending forever → `.stillConfirming` at 60 s and stops polling; `canceled` → `.canceled`.
- [ ] **Step 2: Run** `-only-testing:ClickTests/TicketCheckoutTests` — FAIL.
- [ ] **Step 3: Implement.** The picker sheet runs the checkout; on `.canceled` the sheet stays open with the selection kept; on `.completed` it swaps its content to `OrderConfirmationView` (same sheet, no navigation jump). Free claims go straight to `.confirmed`.
- [ ] **Step 4: Run** — PASS; also run the whole suite to confirm Google sign-in tests still pass.
- [ ] **Step 5: Commit** `feat(ticketing): Stripe checkout handoff with server-confirmed return`

### Task 24: Tickets on the iOS pass screen

**Files:**
- Modify: `Click/Features/Events/ClickPassView.swift`
- Create: `Click/Features/Events/Tickets/TicketPassContent.swift`
- Test: `Tests/ClickTests/TicketPassTests.swift`

**Interfaces:**
- Consumes: `eventTickets`, `cachedEventTickets` (Task 21); wallet endpoint `?ticket=` (web Task 11).
- Produces: in `ClickPassView`, when `beacon.ticketing != nil`, render `TicketPassContent(tickets:, fetchedAt:, cancelled:)` instead of the RSVP pass: `TabView(.page)` pager with "1 of N", a QR tile (`Color.white` background, black code, `.interpolation(.none)`, `.frame(maxWidth: 300)` with ≥ 16 pt white padding, `.environment(\.colorScheme, .light)` on the tile only), the tier name + status, `Order details` `DisclosureGroup`, "Updated X ago" when `fetchedAt` > 60 s old, a status message instead of the QR when not valid/checked-in or when cancelled; refresh `.task` + `scenePhase == .active`; "Add to Apple Wallet" passes the ticket id.
  `static func ticketDisplay(_ t: OwnedTicket, cancelled: Bool) -> TicketDisplay` (`.qr`, `.checkedIn(Date?)`, `.refunded`, `.cancelled`, `.void`) as a pure function.
- [ ] **Step 1: Failing tests:** the `ticketDisplay` table (valid → `.qr`; checked_in → `.checkedIn(date)`; refunded → `.refunded`; void → `.void`; any status with `cancelled: true` → `.cancelled`). Rendering is verified by the PNG pass in Task 26.
- [ ] **Step 2: Run** `-only-testing:ClickTests/TicketPassTests` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): tickets on the iOS pass screen`

### Task 25: Tickets list on the Me tab

**Files:**
- Create: `Click/Features/Events/Tickets/TicketsView.swift`
- Modify: `Click/App/AppRouter.swift` (`case tickets`, canonical tab = `.settings` (Me), screen key), the route switch that builds destinations (find with `grep -n "case .savedEvents" Click/App/*.swift`), `Click/Features/Me/MeView.swift` (row `Tickets`, `ticket` SF Symbol, next to `Saved events`)
- Test: `Tests/ClickTests/AppRouterTests.swift` (extend), `Tests/ClickTests/TicketingTests.swift` (extend)

**Interfaces:**
- Consumes: `myTickets(scope:)`.
- Produces: `TicketsView` — segmented `Picker` Upcoming/Past, rows (event art thumbnail, title, date line, `{n} tickets · {tier}`, `Cancelled` capsule), row → `.eventPass(beaconID:)`; `ContentUnavailableView` empty state "No tickets yet" with "Events you get tickets for show up here."; pull to refresh; cached first paint.
- [ ] **Step 1: Failing tests:** `AppRoute.tickets.canonicalTab == .settings`; grouping/sorting helper `TicketsView.sections(_:)` sorts upcoming soonest-first.
- [ ] **Step 2: Run** `-only-testing:ClickTests/AppRouterTests -only-testing:ClickTests/TicketingTests` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(ticketing): tickets list on the Me tab`

### Task 26: Scanner labels, visual pass, gates, PR

**Files:**
- Modify: `Click/Core/Beacons/EventEngagementRepository.swift` (`PassScan` result enum adds `.refunded`, `.eventCancelled`; decodes `tier_name`), `Click/Features/Events/PassScannerView.swift` (titles `Refunded` / `Event cancelled`, tier line)
- Test: `Tests/ClickTests/EventDetailTests.swift` (extend)

- [ ] **Step 1: Failing test:** `PassScan` decodes `refunded`, `event_cancelled` and `tier_name`; an unknown result → `.invalid`.
- [ ] **Step 2: Run** `-only-testing:ClickTests/EventDetailTests` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Visual pass** (memory "Click iOS visual check": ImageRenderer → PNG) on iPhone SE (3rd gen), iPhone 16, iPhone 16 Pro Max, light and dark, with Dynamic Type default and XXL: event CTA states (rsvp unchanged, get tickets, free, sold out, cancelled, owned), picker sheet (1 tier, 3 tiers incl. sold out, notice, submitting), order confirmation states, ticket pass (valid, 3-ticket pager, checked in, refunded, cancelled, offline "Updated"), tickets list (both scopes + empty). Fix and re-render until nothing clips or truncates important text and the QR stays ≥ 200 pt on SE.
- [ ] **Step 6: Gates.** `xcodegen generate && xcodebuild test -project Click.xcodeproj -scheme ClickTests -destination 'platform=iOS Simulator,name=iPhone 16 Pro'` and `xcodebuild build -project Click.xcodeproj -scheme Click -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO` → both succeed.
- [ ] **Step 7: Simulator E2E** (if Task 20 Step 4 ran): point the simulator build at the local web server (`Config` base URL override used for local dev), buy a ticket from the event screen, see it on the pass screen, scan it from web, confirm the iOS screen shows `Checked in` after refresh. Otherwise note it as skipped in the PR.
- [ ] **Step 8: Commit + PR** `git push -u origin feat/ticketing && gh pr create --base main --title "Ticketing: consumer experience on iOS"` (depends on the web PR; body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).
