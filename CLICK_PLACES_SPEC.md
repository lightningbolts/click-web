# Click Places — Implementation Spec v1

| | |
|---|---|
| **Status** | Ready to implement. Ships dark behind the `click_places` feature flag. |
| **Canonical copy** | `click-web/CLICK_PLACES_SPEC.md`. `click-ios/Docs/CLICK_PLACES_SPEC.md` is a mirror; if the two differ, the click-web copy wins. |
| **Background** | `click-web/CLICK_PLACES_BRAINSTORM.md` (product reasoning). Where this spec and the brainstorm disagree, **this spec wins**. |
| **Repos** | `click-web` (Next.js BFF, canonical Supabase migrations, web UI), `click-ios` (native Swift/SwiftUI). |
| **Written against** | Both repos as of 2026-10-01. The last click-web migration then was `20261008000000_shared_drop_captions.sql`. |

---

## 0. Read this first (for implementing agents)

### 0.1 What you are building, in one paragraph

A **Click Place** is a verified physical business (a café, bar, gym, study space…) that has a permanent pin on the Click map and a Place page. People who are physically there can **check in** ("I'm here") and leave a **Pulse**: a one-tap reading of the energy right now plus one or two optional taps. The Place page shows the live Pulse, how many people are checked in, upcoming events hosted there, whether the viewer's Clicks have been there, the viewer's own history there, and an optional permanent Place Hub chat. The business's managers edit the profile and see aggregate stats. Click Places is built on the existing `venues` B2B table, renamed to `places`.

### 0.2 Hard rules

Follow these exactly. If a task seems to need breaking one of them, stop and leave a note instead.

1. **Never show a business a per-user row.** No API, RLS policy, export or UI may return a user id, name or timestamp of an individual check-in or Pulse to a place manager. Managers get counts and distributions only.
2. **No background location for Places.** Do not use `VisitMonitor`, region monitoring, significant-location changes or background modes for any Places feature. Location is read once, in the foreground, when the user taps a button. The server checks coordinates and **does not store them** on `place_check_ins` or `place_pulses`; only distance and accuracy *buckets* are stored.
3. **No display thresholds.** Every Pulse, check-in count and history count is shown as it is, even when it is 1, together with its sample size and age so users can judge it. Users narrow results with **filters** (§6.6), not hidden cut-offs. Do not add minimum sample sizes, k-anonymity suppression or "not enough data" hiding anywhere. When there is genuinely no data, say so plainly (the "No Pulse" copy in §4.11).
4. **Ship dark.** Every new route returns `404 {"error":"Not found"}` unless `click_places` is enabled for the caller. Use `requireFeature(admin, 'click_places', user.id)`. iOS hides every Places surface unless `FeatureFlags.isEnabled(.clickPlaces)`. The public web page `/p/[slug]` is gated by an environment variable (§7.1), not by a user flag.
5. **Additive, idempotent migrations.** Use `IF NOT EXISTS` / `IF EXISTS` and `CREATE OR REPLACE`. Never write a down-migration. Never edit an existing migration file. New migration files sort after `20261008000000`.
6. **Keep legacy `venue_id` columns.** Existing tables keep their `venue_id` column names (`map_beacons.venue_id`, `event_engagement_events.venue_id`, `connections.venue_id`, `nfc_anchors.venue_id`, `venue_pop_up_hubs.venue_id`, and the partitioned/analytics shells). From this spec on, **`venue_id` always means `places.id`**. All *new* columns are named `place_id`. Do not rename existing `venue_id` columns.
7. **Product language is "Place / Click Places".** Use it in all new user-facing copy, new TypeScript and Swift type names, new routes and new tables. Do not write "venue" in new UI copy. Existing Insights copy may keep "venue" until it is touched.
8. **Don't build what §13 lists as non-goals.** Out of scope for v1: self-serve claiming, tagged (non-official) events, offers/perks, organizations, ticketing integration, Android.
9. **Respect ghost mode and blocks.** Users with `users.ghost_mode = true` are excluded from every count and name that other people can see (they can still check in and see their own state). Blocked users (`loadBlockedUserIds`) never appear in names shown to the viewer.
10. **Honor the Business-insights opt-out.** Rows from users whose `users.location_include_in_insights_enabled` is not `true` never count in manager-facing stats (§4.10). Consumer-facing counts are unaffected.

### 0.3 Repository conventions

**click-web**

| Concern | Convention | Example to copy |
|---|---|---|
| Route auth | `getSupabaseFromRouteRequest(request)`; 401 when no user | `app/api/beacons/[beaconId]/check-in/route.ts` |
| Privileged DB access | `createAdminSupabaseClient()` (service role) inside routes only | same |
| Body parsing | Zod schema in `lib/api/schemas/*.ts` + `parseBody(request, schema)` | `lib/api/schemas/beacons.ts` |
| Errors | `apiError(message, status, code)` → `{ error, code }` | `lib/api/errors.ts` |
| Feature flag | `requireFeature(admin, 'click_places', user.id)`; tunables via `configNumber(config, key, fallback, {min,max})` | `lib/server/reconnectNearby.ts` |
| Pure logic | Testable, framework-free functions in `lib/<domain>/*.ts` | `lib/map/soundtrackPresence.ts` |
| Server glue | `lib/server/<feature>.ts` with `import 'server-only'` | `lib/server/soundtrackPresence.ts` |
| Peers / blocks | `loadViewerPeers(admin, viewerId)`, `loadBlockedUserIds(admin, viewerId)` | `lib/server/connections/viewerPeers.ts` |
| Distance | `haversineMeters(lat1, lon1, lat2, lon2)` | `lib/server/eventEngagement.ts` |
| Event visibility | `filterBeaconsForViewer`, `parseBeaconVisibilityAudience` | `lib/map/beaconVisibility.ts` |
| Telemetry | `emitProductEvent` with allowlisted names and props | `lib/server/telemetry/productEvents.ts` |
| Tests | Jest under `__tests__/` mirroring the path (`__tests__/lib/...`, `__tests__/app/api/...`) | `__tests__/app/api/hub.route.contract.test.ts` |
| Checks before pushing | `npm run typecheck && npm run lint && npm test` | `AGENTS.md` |
| Next.js | This is Next 16 with breaking changes. Read `node_modules/next/dist/docs/` before writing page code. `params` is a `Promise`. | `app/e/[beaconId]/page.tsx` |

**click-ios**

| Concern | Convention | Example to copy |
|---|---|---|
| Language | Swift 6, SwiftUI, `@Observable` + `@MainActor` view models. No base classes, no service locators. | `Click/Features/Map/MapFeatureModel.swift` |
| HTTP | `api.executeRaw(APIRequest(path:method:queryItems:body:))`, decoded with `JSONFields` helpers | `Click/Core/Beacons/BeaconRepository.swift` |
| Repositories | Owned by `AppEnvironment` (`Click/App/AppEnvironment.swift`) | `self.hubs = HubRepository(...)` |
| Flags | `FeatureFlags.Key` enum + `env.features.isEnabled(.key)` | `Click/Core/Config/FeatureFlags.swift` |
| Routes | `AppRoute` case + destination in `AppRouteDestination.swift` (the switch has no `default`, so a missing destination is a compile error) + URL parsing in `AppRouter.swift` | `.event(beaconID:)`, `.hub(hubID:)` |
| Location | One-shot fix for a single action; the server owns the geofence | `BeaconDetailView.swift` check-in (~L757), `Click/Core/Location/LocationProvider.swift` |
| Project | XcodeGen (`project.yml`). New files under `Click/` are picked up by `xcodegen generate`. | `AI.md` |
| Tests | XCTest in `Tests/ClickTests/` | `NearbyMapTests.swift`, `AppRouterTests.swift` |

### 0.4 Work breakdown and order

Each row is one pull request. Work them **in order**; later PRs depend on earlier ones. Web PRs go to `click-web`, iOS PRs to `click-ios`.

| PR | Repo | Title | Depends on | Spec § |
|---|---|---|---|---|
| **W1** | web | Rename venues → places (+ compatibility views) and update code references | — | 3.1 |
| **W2** | web | Privacy and correctness prerequisites (insights opt-out, signup hardening, manager-insert hardening) | W1 | 3.2 |
| **W3** | web | Places core schema: place columns, check-ins, pulses, encounter attribution, place hub link, flag, storage | W2 | 3.3 |
| **W4** | web | Pure domain library `lib/places/*` + unit tests | W3 | 4 |
| **W5** | web | Consumer APIs: nearby, detail, check-in, pulse, me/places | W4 | 5.1–5.6 |
| **W6** | web | Manager + Insights APIs, photo upload, admin actions | W4 | 5.7–5.10 |
| **W7** | web | Event ↔ Place surfacing (event payload `place`, hub-create guard, reconnect copy) | W5 | 5.11 |
| **W8** | web | Web UI: `/p/[slug]`, `/business/places`, `/insights/place`, `/admin/places`, AASA | W5, W6 | 7 |
| **W9** | web | Maintenance: retention purge, daily rollup, cron wiring | W3 | 3.4, 8 |
| **I1** | ios | Models, repository, flag, routes, deep links | W5 | 6.1–6.3 |
| **I2** | ios | Map: Place pins, layer, event merge, filters | I1 | 6.5–6.6 |
| **I3** | ios | Place detail, check-in, Pulse, QR entry | I1 | 6.4, 6.7–6.8 |
| **I4** | ios | Event detail link, settings toggle, Me → Places, reconnect copy | I3, W7 | 6.9–6.11 |

**Definition of done for every PR:** the code compiles; repo checks pass (web: `npm run typecheck && npm run lint && npm test`; iOS: `xcodebuild test … -scheme ClickTests`); the tests listed for that PR in §11 exist and pass; no rule in §0.2 is broken; nothing new is visible with the flag off.

---

## 1. Product specification

### 1.1 Glossary

| Term | Meaning | Storage |
|---|---|---|
| **Place** | Canonical Click identity of a verified physical business | `public.places` (formerly `venues`) |
| **Listed Place** | A verified Place shown to consumers (map, page, search) | `places.listed = true` |
| **Manager** | A person who runs a Place on Click (role `owner`, `manager` or `viewer`) | `public.place_managers` (formerly `venue_managers`) |
| **Check-in** | The user's explicit "I'm here", valid for a limited time | `public.place_check_ins` (formerly `venue_check_ins`) |
| **Presence** | Proof that a user is at a Place right now: an active check-in, an active check-in at an official event there, or a recent verified handshake there | Derived (§4.4) |
| **Pulse** | One user's structured reading of a Place at a moment | `public.place_pulses` |
| **Pulse summary** | The time-decayed aggregate of recent Pulses | Computed on read (§4.5) |
| **Official event** | An event (`map_beacons`, `beacon_type = 'event'`) with `venue_id = places.id` | Existing column; only managers can set it |
| **Place Hub** | The optional permanent community hub owned by a Place | `hub_venues.place_id` |
| **Anchor** | A printed QR code at the Place that proves physical presence | `nfc_anchors` with `purpose = 'check_in'` |
| **Here now** | Number of people with an active check-in | Computed (§4.7) |

### 1.2 Naming

- Product: **Click Places**. Singular: a **Place**. The business product stays **Click for Business**. Its new Place tab is called **Place**.
- Never say "venue" in new copy. "Check in" (verb) and "check-in" (noun). "Pulse" is capitalized when it names the feature.
- Energy labels, exactly: **Chill**, **Steady**, **Lively**, **Packed**.

### 1.3 Eligibility and categories

Postgres enum `public.place_category`. The category decides which optional Pulse question is asked (§4.3).

| Value | UI label | SF Symbol (iOS) | Category question |
|---|---|---|---|
| `cafe` | Café | `cup.and.saucer.fill` | seats |
| `bar` | Bar | `wineglass.fill` | line |
| `nightlife` | Nightlife | `sparkles` | line |
| `music_venue` | Music venue | `music.mic` | line |
| `restaurant` | Restaurant | `fork.knife` | wait |
| `gym` | Gym | `figure.strengthtraining.traditional` | equipment |
| `coworking` | Coworking | `laptopcomputer` | seats |
| `study_space` | Study space | `books.vertical.fill` | seats |
| `entertainment` | Entertainment | `gamecontroller.fill` | line |
| `bookstore` | Bookstore | `book.fill` | *(none)* |
| `campus_space` | Campus space | `building.columns.fill` | seats |
| `other` | Place | `mappin.circle.fill` | *(none)* |

**Never eligible** (admins must refuse; not representable as a category): private homes, medical or mental-health clinics, places of worship, support-group locations, shelters, K–12 schools, parks and other public land with no operator. Parks and plazas stay as standalone community hubs.

### 1.4 User stories (v1 acceptance)

Consumers (iOS, flag on):

1. **Map.** I see every listed Place near me as a distinct pin. A Place with a live Pulse shows an energy ring. A Place with an official event today shows a time badge, and that event does **not** also appear as a separate pin.
2. **Filter.** From the Nearby sheet I can filter Places by category, "Pulse now", minimum number of reports, energy, "Events today", "Open now", "I've been here", "My Clicks have been here" and "Has hub". The default is no filters, which shows all Places.
3. **Place page.** Tapping a pin opens a Place page with photo, name, category, address, directions, hours (open/closed now), the current Pulse with report count and age, the number checked in now, upcoming official events, my Clicks who have been here (if they share it), my own history, and the Place Hub (if enabled).
4. **Check in.** I tap "I'm here". The app reads my location once. If I'm inside the Place's radius I'm checked in for up to 3 hours. Otherwise I see a clear error and nothing is stored except an anonymous reject reason.
5. **QR check-in.** I scan the QR code at the counter (camera or the in-app scanner). The app opens the Place and asks "Check in at <name>?". On confirm I'm checked in.
6. **Pulse.** While present I see "How's the energy?" with four chips. One tap submits. One or two optional follow-ups appear inline. I can update my Pulse after 45 minutes.
7. **Check out.** I tap "Leave" or the check-in expires. When I leave explicitly, I'm asked one optional question: "Come back at this time?".
8. **Share presence (optional).** At check-in I can turn on "Let my Clicks see I'm here". It applies to this check-in only and is off by default.
9. **History.** On a Place page I see "You've been here N times · Last on <date>" and "You met <names> here".
10. **Privacy setting.** In Settings → Privacy I can turn on "Show my Place visits to my Clicks" (default off). When on, my connections see me in "Clicks who've been here" (§4.8).

Managers (web):

11. I can edit my Place's description, photo, hours, website and Place Hub toggle at `/business/places/[id]`.
12. I can see basic stats (check-ins, unique visitors, Pulse distribution, busiest hours, events hosted, connections made here) for the last 30 days. With Click for Business I see 90-day trends, repeat-visit rate, dwell and event vs regular comparisons at `/insights/place`.
13. I can download a printable QR poster for check-in.

Admins (web):

14. I can create a Place, set its location and radius, verify it, list or unlist it, add managers by email, create or rotate check-in QR anchors, enable its hub, and backfill encounter attribution.

### 1.5 Decisions log

| # | Decision | Why |
|---|---|---|
| D1 | `venues` is renamed to `places`. There is no parallel table. | One canonical place entity; billing, RBAC and Insights carry over. |
| D2 | No display thresholds. Show sample size and age; give users filters. | Product direction. Transparency instead of hiding. |
| D3 | Presence is foreground-only. Coordinates are checked, not stored. | Privacy. Matches the `alert_confirmations` precedent. |
| D4 | One pin per physical place. Official events and the Place Hub render *inside* the Place. | No duplicate pins. |
| D5 | v1 Places are created and verified by Click admins (pilot partners). | Verification without building claim flows first. |
| D6 | Managers cannot submit Pulse for their own Place (403). | Manipulation resistance. |
| D7 | The Pulse questions come from the server (`GET .../pulse`). iOS renders them; it does not hard-code them. | Questions can be tuned without an app release. |
| D8 | Place pages are public on the web at `/p/[slug]`. Check-in and Pulse are iOS-only in v1. | SEO and sharing; physical presence stays on the phone (`PRODUCT.md`). |
| D9 | Raw check-ins are kept 90 days. Pulse `user_id` is nulled after 30 days. Daily rollups keep long-term trends. | Data minimization with useful history. |
| D10 | "Here now" names are shown only for connections who opted in *for that check-in*. "Been here" names only for connections who enabled the global setting. | Explicit consent per visibility type. |
| D11 | (2026-10-02, supersedes D5 and the self-serve part of rule 8) Businesses set up their own Place at `/business/places/new` (`POST /api/places`). It starts `pending` and unlisted with the submitter as owner; a Click admin verifies it (which creates its check-in QR code), then the owner chooses when to go live (`PATCH listed`). Categories add `event_space` and `office`. | Intuitive setup for restaurants, event spaces and companies while keeping verification. |

---

## 2. What exists today (only what this spec builds on)

Read these files before starting the matching PR.

| Thing | File(s) | What you need to know |
|---|---|---|
| `venues` (→ `places`) | `supabase/migrations/20260331120000_insights_venues_rbac.sql`, `20260409120000_vibe_radar_intents_and_beacons.sql` (adds `latitude`, `longitude`) | Columns: `id, name, location (free-text address), floorplan_svg_url, stripe_customer_id, stripe_subscription_id, subscription_status, created_at, latitude, longitude`. RLS: managers can select and update; **any** authenticated user can insert. |
| `venue_managers` (→ `place_managers`) | same | `id, user_id, venue_id, role ('owner','manager','viewer'), created_at`. RLS: own rows select. Self-owner insert is allowed when the venue has no managers (a hole once Places are public; closed in W2). |
| `venue_check_ins` (→ `place_check_ins`) | `20260331130000_advanced_metrics_rpc.sql`, `20260824040000_*` (adds `beacon_id`) | `id, venue_id, user_id, checked_at, created_at, beacon_id`. **No writers.** It has a manager per-row SELECT policy, which W3 drops. |
| `nfc_anchors` | `20260331120000_*` | `id, venue_id, name, map_x, map_y (NOT NULL), qr_token (unique uuid), created_at`. Reused for check-in QR codes. |
| Event ↔ venue | `app/api/beacons/route.ts` ~L467–483 | `venue_id` is accepted on event create only when the caller is in `venue_managers` for it. List and detail responses include `venue_id`. |
| Event check-in | `app/api/beacons/[beaconId]/check-in/route.ts`, `lib/server/eventCheckInGeofence.ts`, `lib/server/eventEngagement.ts` | Model for the Place check-in route: GPS → geofence → upsert → telemetry. |
| Encounter writes | `lib/server/proximity/encounterPersistence.ts`, `lib/server/proximity/confirmProximitySelection.ts`, `supabase/functions/bind-proximity-connection/index.ts` | Encounters are written from several paths. That is why W3 attributes Places with a **DB trigger**, not app code. |
| Connection insights flag | `bind-proximity-connection/index.ts` ~L423, `lib/server/proximity/connectionEnsure.ts` ~L70 | Both hard-code `include_in_business_insights: true`. W2 fixes this. |
| User privacy toggles | iOS `Click/Core/Me/MeRepository.swift` (`LocationPrivacy`) | Stored as columns on `public.users`: `location_connection_snap_enabled`, `location_show_on_map_enabled`, `location_include_in_insights_enabled`. They are **not** declared in click-web migrations (they predate them). W2 adds them with `IF NOT EXISTS`. |
| Hubs | `20260403100000_*`, `20260511120000_*`, `20260807000000_*`, `20260831000000_event_auto_hubs.sql` (latest `get_hubs_nearby`), `lib/server/hubGatekeeper.ts`, `app/api/hub/*` | Standalone hubs: permanent, geofenced join, membership in `hub_participants`. |
| Feature flags | `20260930000000_feature_flags_and_drop_develop.sql`, `lib/server/featureFlags.ts`, iOS `FeatureFlags.swift` | Add `click_places` to `FEATURE_KEYS` (web) and `FeatureFlags.Key` (iOS). |
| Cron | `supabase/functions/cron-hourly-maintenance/index.ts` (`runClickWebCron(path, label)`), `lib/server/cronAuth.ts` (`authorizeCronRequest`) | W9 adds `/api/cron/places` and calls it from the edge function. |
| iOS map | `Click/Features/Map/MapFeatureModel.swift`, `ClickMapView.swift`, `NearbySheet.swift`, `Click/Core/Beacons/MapBeacon.swift` (`MapLayer`), `BeaconRepository.discovery` | Places become a new `MapItem.Kind` and `MapLayer`. Apple POIs are already hidden (`pointsOfInterest: .excludingAll`). |
| iOS deep links | `Click/App/AppRouter.swift` (`click://e/…`, `https://…/e/…`), `public/.well-known/apple-app-site-association` (paths `/c/*`, `/e/*`) | Add `/p/*`. |
| Business signup | `app/business/actions.ts`, `app/business/signup/BusinessSignupFlow.tsx` | Inserts the venue with the **user's** token. W2 moves it to the service role. |
| Insights shell | `components/insights/BusinessInsightsShell.tsx` (`NAV` array, `withVenue(href)` appends `?venue_id=`) | Add a "Place" item. |
| Admin | `app/(admin)/admin/page.tsx`, `app/(admin)/admin/actions.ts` (`requireAdminSession`, `redirectWithStatus`, `approveVenueAction`) | Add a Places admin page next to it. |

---

## 3. Data model

There are four migrations. File names are fixed; use them exactly.

The SQL below was dry-run on Postgres 16, applied twice to confirm it is idempotent. Stub PostGIS functions stood in for the real extension, and stubs stood in for the pre-existing tables. Checks covered: compatibility views and old RPC bodies keep working, client writes are refused, every constraint fires, the encounter trigger and backfill attribute only inside the radius, managers can't read check-in rows, and purge works. Still re-run it on a local Supabase (`supabase db reset`) with real PostGIS before merging.

| PR | File | Purpose |
|---|---|---|
| W1 | `supabase/migrations/20261010000000_click_places_rename.sql` | Rename tables and add compatibility views |
| W2 | `supabase/migrations/20261010010000_click_places_prereqs.sql` | Privacy columns; revoke direct client writes |
| W3 | `supabase/migrations/20261010020000_click_places_core.sql` | Everything Places needs |
| W9 | `supabase/migrations/20261010030000_click_places_maintenance.sql` | Rollup table and purge function |

### 3.1 Migration W1: rename

**Deploy order:** apply the migration first. It is backward compatible because the old names keep working through views. Then deploy the code that uses the new names.

```sql
-- Click Places, step 1: the B2B venue tables become the product's Place tables.
-- Compatibility views keep every old name (venues, venue_managers, venue_check_ins) working for
-- existing code, RPC bodies, the Android client and the Stripe webhook until they are migrated.
-- Policies, indexes, foreign keys and the venue_metrics_materialized view follow the table by OID.

DO $$
BEGIN
    IF to_regclass('public.places') IS NULL THEN
        ALTER TABLE public.venues RENAME TO places;
    END IF;

    IF to_regclass('public.place_managers') IS NULL THEN
        ALTER TABLE public.venue_managers RENAME TO place_managers;
        ALTER TABLE public.place_managers RENAME COLUMN venue_id TO place_id;
    END IF;

    IF to_regclass('public.place_check_ins') IS NULL THEN
        ALTER TABLE public.venue_check_ins RENAME TO place_check_ins;
        ALTER TABLE public.place_check_ins RENAME COLUMN venue_id TO place_id;
    END IF;
END $$;

-- Simple single-table views are auto-updatable; security_invoker applies the base table's RLS
-- and grants to the caller, exactly as before the rename.
CREATE OR REPLACE VIEW public.venues WITH (security_invoker = true) AS
    SELECT * FROM public.places;

CREATE OR REPLACE VIEW public.venue_managers WITH (security_invoker = true) AS
    SELECT id, user_id, place_id AS venue_id, role, created_at
    FROM public.place_managers;

CREATE OR REPLACE VIEW public.venue_check_ins WITH (security_invoker = true) AS
    SELECT id, place_id AS venue_id, user_id, checked_at, created_at, beacon_id
    FROM public.place_check_ins;

COMMENT ON VIEW public.venues IS 'Compatibility view for public.places (Click Places rename). New code uses places.';
COMMENT ON VIEW public.venue_managers IS 'Compatibility view for public.place_managers. New code uses place_managers.place_id.';
COMMENT ON VIEW public.venue_check_ins IS 'Compatibility view for public.place_check_ins.';

-- Mirror the grants the old tables had (20260331120000 / 20260331130000).
GRANT SELECT, INSERT, UPDATE ON public.venues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_managers TO authenticated;
GRANT SELECT ON public.venue_check_ins TO authenticated;
GRANT ALL ON public.venues, public.venue_managers, public.venue_check_ins TO service_role;

NOTIFY pgrst, 'reload schema';
```

**W1 code changes.** Do them mechanically and change nothing else.

1. Every `.from('venues')` / `.from("venues")` → `.from('places')`.
2. Every `.from('venue_managers')` → `.from('place_managers')`, **and** in the same query chain rename the column: `.eq('venue_id', …)` → `.eq('place_id', …)`, `select('venue_id')` → `select('place_id')`, insert payload key `venue_id` → `place_id`, and any reads of `row.venue_id` from that result → `row.place_id`.
3. Do **not** touch `venue_id` on any other table: `map_beacons`, `event_engagement_events`, `connections`, `nfc_anchors`, `venue_pop_up_hubs`.
4. Files that reference these tables today (from `grep -rln "from(['\"]venue" app lib components __tests__ supabase/functions`): `app/business/actions.ts`, `app/api/beacons/route.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/insights/beacons/route.ts`, `app/api/insights/intents/route.ts`, `app/api/insights/venue/route.ts`, `app/api/insights/[venueId]/route.ts`, `app/api/insights/[venueId]/{network-health-trend,beacons,advanced-metrics,events,event-engagement}/route.ts`, `app/(admin)/admin/actions.ts`, `app/insights/vibe-radar/page.tsx`, `lib/server/resolveInsightsVenueId.ts`, `lib/server/admin/dashboardData.ts`, `lib/server/businessInsightsEligibility.ts`, `lib/events/beaconManageAuth.ts`. Re-run the grep at the end; the only remaining hits may be `venue_pop_up_hubs` and `event_venues_cache`, which are different tables that keep their names.
5. Update test mocks that stub `from('venues')` / `from('venue_managers')`.
6. **Do not drop the compatibility views** in this project. A later cleanup may drop them once `click`, `click-ios`, `click-web` and the edge functions all have zero references.

### 3.2 Migration W2: prerequisites

**Deploy order:** deploy the **code** first (the signup action must already use the service role), then apply the migration.

```sql
-- Click Places, step 2: privacy columns + no direct client writes to Places or their managers.

-- 1. Privacy columns. location_include_in_insights_enabled already exists in production (written
--    by the mobile Settings screen); IF NOT EXISTS makes this a no-op there and declares it for
--    fresh databases. Default false = no accidental opt-in (matches iOS LocationPrivacy).
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS location_include_in_insights_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS place_visits_visible_to_connections BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.place_visits_visible_to_connections IS
    'Click Places: when true, the user''s connections see them under "Clicks who''ve been here" (no times).';

-- Harmless when users already has a table-level UPDATE grant; required if it uses column grants.
GRANT UPDATE (place_visits_visible_to_connections) ON public.users TO authenticated;

-- 2. Places and managers are written only by click-web with the service role from now on.
REVOKE INSERT, UPDATE, DELETE ON public.places FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.venues FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.place_managers FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.venue_managers FROM authenticated, anon;

DROP POLICY IF EXISTS "venues_insert_authenticated" ON public.places;
DROP POLICY IF EXISTS "venues_update_owners" ON public.places;
DROP POLICY IF EXISTS "venue_managers_insert_self_owner" ON public.place_managers;
DROP POLICY IF EXISTS "venue_managers_insert_by_owner" ON public.place_managers;
DROP POLICY IF EXISTS "venue_managers_update_owner_role" ON public.place_managers;
DROP POLICY IF EXISTS "venue_managers_delete_owner" ON public.place_managers;
-- Kept: venues_select_managers (on places), venue_managers_select_self (on place_managers).

NOTIFY pgrst, 'reload schema';
```

**W2 code changes**

1. **`app/business/actions.ts` → `createVenueForCheckout`.** Keep the function name (the UI imports it). Verify the user with the access token as today, then use `createAdminSupabaseClient()` to:
   - insert into `places` with `{ name, location, subscription_status: 'inactive' }` (never accept any other column from the client), then
   - insert into `place_managers` `{ user_id, place_id, role: 'owner' }`.
   - If the manager insert fails, delete the place row and return the error.
   - `createStripeCheckoutSession` keeps its membership check but reads `place_managers` with `place_id`.
2. **Insights opt-out at write time.** Add `lib/server/connections/insightsOptIn.ts`:
   ```ts
   /** True only when every member has location_include_in_insights_enabled = true. */
   export async function allMembersOptedIntoInsights(admin: SupabaseClient, userIds: string[]): Promise<boolean>
   ```
   It selects `id, location_include_in_insights_enabled` from `users` where `id in userIds` and returns `rows.length === new Set(userIds).size && rows.every(r => r.location_include_in_insights_enabled === true)`. On a read error it returns `false` (fail closed).
   - In `lib/server/proximity/connectionEnsure.ts`, replace `include_in_business_insights: true` with the helper's result for `members`.
   - In `supabase/functions/bind-proximity-connection/index.ts` (Deno, cannot import from `lib/`), inline the same query and logic and replace the hard-coded `true`.
   - Leave `lib/connections/priorConnections.ts` as it is (already `false`).
3. **Admin approve/reject** (`app/(admin)/admin/actions.ts`) already uses the admin client; only the `.from('places')` rename from W1 applies.

### 3.3 Migration W3: Places core

```sql
-- Click Places, step 3: consumer-facing Place profile, presence (check-ins), Pulse, encounter →
-- place attribution, Place Hubs, nearby RPC, photo bucket and the click_places flag.
-- Additive and idempotent. Ships dark (click_places flag starts disabled).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.place_category AS ENUM (
        'cafe', 'bar', 'nightlife', 'music_venue', 'restaurant', 'gym', 'coworking',
        'study_space', 'entertainment', 'bookstore', 'campus_space', 'other'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.place_verification_status AS ENUM ('draft', 'pending', 'verified', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.place_presence_proof AS ENUM ('qr', 'gps', 'event', 'encounter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. places: consumer profile, geofence, verification, listing
--    (the legacy free-text address column is named "location"; the geography column is geo_point)
-- ---------------------------------------------------------------------------
ALTER TABLE public.places
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS category public.place_category,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS photo_path TEXT,
    ADD COLUMN IF NOT EXISTS hours JSONB,
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    ADD COLUMN IF NOT EXISTS address_line TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS region TEXT,
    ADD COLUMN IF NOT EXISTS postal_code TEXT,
    ADD COLUMN IF NOT EXISTS country_code TEXT,
    ADD COLUMN IF NOT EXISTS website_url TEXT,
    ADD COLUMN IF NOT EXISTS radius_meters INTEGER NOT NULL DEFAULT 75,
    ADD COLUMN IF NOT EXISTS verification_status public.place_verification_status NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS hub_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.places
    ADD COLUMN IF NOT EXISTS geo_point geography (Point, 4326)
    GENERATED ALWAYS AS (
        CASE
            WHEN latitude IS NOT NULL AND longitude IS NOT NULL
            THEN ST_SetSRID (ST_MakePoint (longitude, latitude), 4326)::geography
        END
    ) STORED;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_slug_format') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_slug_format CHECK (
            slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 80)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_radius_range') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_radius_range CHECK (radius_meters BETWEEN 25 AND 750);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_description_len') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_description_len CHECK (
            description IS NULL OR char_length(description) <= 500
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_hours_object') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_hours_object CHECK (
            hours IS NULL OR jsonb_typeof(hours) = 'object'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_lat_lng_range') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_lat_lng_range CHECK (
            (latitude IS NULL OR latitude BETWEEN -90 AND 90)
            AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'places_listed_requires_verified') THEN
        ALTER TABLE public.places ADD CONSTRAINT places_listed_requires_verified CHECK (
            NOT listed OR (
                verification_status = 'verified'
                AND latitude IS NOT NULL AND longitude IS NOT NULL
                AND slug IS NOT NULL AND category IS NOT NULL
            )
        );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS places_slug_key ON public.places (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_places_geo_point_gix ON public.places USING GIST (geo_point);
CREATE INDEX IF NOT EXISTS idx_places_listed ON public.places (listed) WHERE listed;

CREATE OR REPLACE FUNCTION public.places_touch_updated_at ()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_places_touch_updated_at ON public.places;
CREATE TRIGGER trg_places_touch_updated_at
    BEFORE UPDATE ON public.places
    FOR EACH ROW EXECUTE FUNCTION public.places_touch_updated_at ();

COMMENT ON COLUMN public.places.location IS 'Legacy free-text address from B2B signup. Prefer address_line/city.';
COMMENT ON COLUMN public.places.geo_point IS 'Generated from latitude/longitude; Place center for geofence and nearby.';
COMMENT ON COLUMN public.places.radius_meters IS 'Presence radius (25–750 m) for check-in and encounter attribution.';
COMMENT ON COLUMN public.places.listed IS 'Shown to consumers (map, /p page). Requires verified + coordinates + slug + category.';
COMMENT ON COLUMN public.places.hours IS 'Weekly hours: {"mon":[["07:00","15:00"]],...}; closing before opening means after midnight. Missing day = closed.';

-- ---------------------------------------------------------------------------
-- 3. place_check_ins: explicit, expiring presence. Coordinates are never stored.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "venue_check_ins_select_managers" ON public.place_check_ins;
DROP POLICY IF EXISTS "place_check_ins_select_own" ON public.place_check_ins;
CREATE POLICY "place_check_ins_select_own"
    ON public.place_check_ins FOR SELECT TO authenticated
    USING (user_id = auth.uid ());

REVOKE INSERT, UPDATE, DELETE ON public.place_check_ins FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.venue_check_ins FROM authenticated, anon;

ALTER TABLE public.place_check_ins
    ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS checkout_reason TEXT,
    ADD COLUMN IF NOT EXISTS proof public.place_presence_proof,
    ADD COLUMN IF NOT EXISTS proof_weight REAL,
    ADD COLUMN IF NOT EXISTS anchor_id UUID REFERENCES public.nfc_anchors (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS distance_bucket TEXT,
    ADD COLUMN IF NOT EXISTS accuracy_bucket TEXT,
    ADD COLUMN IF NOT EXISTS share_with_connections BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS count_for_insights BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS app_version TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_check_ins_checkout_reason') THEN
        ALTER TABLE public.place_check_ins ADD CONSTRAINT place_check_ins_checkout_reason CHECK (
            checkout_reason IS NULL OR checkout_reason IN ('user', 'expired', 'superseded')
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_check_ins_proof_kind') THEN
        ALTER TABLE public.place_check_ins ADD CONSTRAINT place_check_ins_proof_kind CHECK (
            proof IS NULL OR proof IN ('qr', 'gps')
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_check_ins_buckets') THEN
        ALTER TABLE public.place_check_ins ADD CONSTRAINT place_check_ins_buckets CHECK (
            (distance_bucket IS NULL OR distance_bucket IN ('0_25', '25_75', '75_150', '150_400', '400_plus'))
            AND (accuracy_bucket IS NULL OR accuracy_bucket IN ('0_20', '20_50', '50_100', '100_plus'))
        );
    END IF;
END $$;

-- At most one open check-in per user per Place. Stale open rows are closed before inserting (§5.4).
CREATE UNIQUE INDEX IF NOT EXISTS place_check_ins_one_open
    ON public.place_check_ins (user_id, place_id) WHERE checked_out_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_place_check_ins_place_time
    ON public.place_check_ins (place_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_check_ins_user_time
    ON public.place_check_ins (user_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_check_ins_open
    ON public.place_check_ins (place_id, expires_at) WHERE checked_out_at IS NULL;

COMMENT ON TABLE public.place_check_ins IS
    'Click Places explicit check-ins. Written only by click-web (service role). Never expose rows to managers. Purged after 90 days.';

-- ---------------------------------------------------------------------------
-- 4. place_pulses: one structured reading by a present user. Service role only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.place_pulses (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    place_id           UUID NOT NULL REFERENCES public.places (id) ON DELETE CASCADE,
    user_id            UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    check_in_id        UUID REFERENCES public.place_check_ins (id) ON DELETE SET NULL,
    beacon_id          UUID REFERENCES public.map_beacons (id) ON DELETE SET NULL,
    proof              public.place_presence_proof NOT NULL,
    proof_weight       REAL NOT NULL CHECK (proof_weight > 0 AND proof_weight <= 1),
    energy             SMALLINT CHECK (energy BETWEEN 1 AND 4),
    talkable           SMALLINT CHECK (talkable IN (0, 1)),
    category_question  TEXT CHECK (category_question IN ('seats', 'line', 'wait', 'equipment')),
    category_answer    SMALLINT CHECK (category_answer BETWEEN 1 AND 3),
    would_return       SMALLINT CHECK (would_return IN (0, 1)),
    question_version   SMALLINT NOT NULL DEFAULT 1,
    count_for_insights BOOLEAN NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT place_pulses_has_answer CHECK (energy IS NOT NULL OR would_return IS NOT NULL),
    CONSTRAINT place_pulses_category_pair CHECK ((category_question IS NULL) = (category_answer IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_place_pulses_place_time ON public.place_pulses (place_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_place_pulses_user_place_time
    ON public.place_pulses (user_id, place_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE public.place_pulses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_pulses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.place_pulses TO service_role;

COMMENT ON TABLE public.place_pulses IS
    'Click Places Pulse. energy: 1 chill, 2 steady, 3 lively, 4 packed. talkable/would_return: 1 yes, 0 no. category_answer: 1 low, 2 some, 3 high (meaning per category_question). user_id nulled after 30 days.';

-- ---------------------------------------------------------------------------
-- 5. QR anchors for check-in
-- ---------------------------------------------------------------------------
ALTER TABLE public.nfc_anchors
    ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'floorplan',
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nfc_anchors_purpose') THEN
        ALTER TABLE public.nfc_anchors ADD CONSTRAINT nfc_anchors_purpose CHECK (purpose IN ('floorplan', 'check_in'));
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Place Hub link (one hub per Place). The Place pin is the hub's map surface.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hub_venues
    ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES public.places (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hub_venues_place_id_key
    ON public.hub_venues (place_id) WHERE place_id IS NOT NULL;

-- Same body as 20260831000000_event_auto_hubs.sql plus "AND h.place_id IS NULL".
CREATE OR REPLACE FUNCTION public.get_hubs_nearby(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 15000,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id text,
    name text,
    category text,
    geofence_lat double precision,
    geofence_long double precision,
    radius_meters integer,
    expires_at timestamptz,
    distance_meters double precision,
    participant_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH nearby AS (
        SELECT
            h.id, h.name, h.category, h.geofence_lat, h.geofence_long, h.radius_meters, h.expires_at,
            ST_Distance(h.location, ST_SetSRID (ST_MakePoint (lng, lat), 4326)::geography) AS distance_meters
        FROM public.hub_venues h
        WHERE (h.expires_at IS NULL OR h.expires_at > now())
          AND h.event_beacon_id IS NULL
          AND h.place_id IS NULL
          AND ST_DWithin (h.location, ST_SetSRID (ST_MakePoint (lng, lat), 4326)::geography, radius_meters)
        ORDER BY distance_meters ASC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    )
    SELECT n.id, n.name, n.category, n.geofence_lat, n.geofence_long, n.radius_meters, n.expires_at,
           n.distance_meters, COALESCE(pc.cnt, 0::bigint) AS participant_count
    FROM nearby n
    LEFT JOIN (
        SELECT hub_id, COUNT(*)::bigint AS cnt FROM public.hub_participants GROUP BY hub_id
    ) pc ON pc.hub_id = n.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Encounter → Place attribution (all write paths, via trigger)
-- ---------------------------------------------------------------------------
ALTER TABLE public.connection_encounters
    ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES public.places (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_connection_encounters_place_time
    ON public.connection_encounters (place_id, encountered_at DESC) WHERE place_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_place_at (p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT p.id
    FROM public.places p
    WHERE p_lat IS NOT NULL AND p_lng IS NOT NULL
      AND NOT (p_lat = 0 AND p_lng = 0)
      AND p.verification_status = 'verified'
      AND p.geo_point IS NOT NULL
      -- 750 m prefilter (max radius) lets the GIST index work; then the per-Place radius.
      AND ST_DWithin (p.geo_point, ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography, 750)
      AND ST_DWithin (p.geo_point, ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography, p.radius_meters)
    ORDER BY ST_Distance (p.geo_point, ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography)
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_place_at (double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_place_at (double precision, double precision) TO service_role;

CREATE OR REPLACE FUNCTION public.connection_encounters_assign_place ()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.place_id IS NULL AND NEW.gps_lat IS NOT NULL AND NEW.gps_lon IS NOT NULL THEN
        NEW.place_id := public.resolve_place_at (NEW.gps_lat, NEW.gps_lon);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_encounters_assign_place ON public.connection_encounters;
CREATE TRIGGER trg_connection_encounters_assign_place
    BEFORE INSERT OR UPDATE OF gps_lat, gps_lon ON public.connection_encounters
    FOR EACH ROW EXECUTE FUNCTION public.connection_encounters_assign_place ();

-- Re-attribute history after a Place is verified, moved, or its radius changes (admin action).
CREATE OR REPLACE FUNCTION public.backfill_place_encounters (p_place_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.connection_encounters SET place_id = NULL WHERE place_id = p_place_id;

    UPDATE public.connection_encounters e
    SET place_id = p_place_id
    FROM public.places p
    WHERE p.id = p_place_id
      AND p.verification_status = 'verified'
      AND p.geo_point IS NOT NULL
      AND e.place_id IS NULL
      AND e.gps_lat IS NOT NULL AND e.gps_lon IS NOT NULL
      AND NOT (e.gps_lat = 0 AND e.gps_lon = 0)
      AND ST_DWithin (p.geo_point, ST_SetSRID (ST_MakePoint (e.gps_lon, e.gps_lat), 4326)::geography, p.radius_meters);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_place_encounters (uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_place_encounters (uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Nearby listed Places (service role; click-web serializes the public fields)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.places_nearby (
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_meters DOUBLE PRECISION DEFAULT 5000,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (place_id UUID, distance_meters DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT p.id,
           ST_Distance (p.geo_point, ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography)
    FROM public.places p
    WHERE p.listed
      AND p.verification_status = 'verified'
      AND p.geo_point IS NOT NULL
      AND ST_DWithin (
          p.geo_point,
          ST_SetSRID (ST_MakePoint (p_lng, p_lat), 4326)::geography,
          LEAST(GREATEST(COALESCE(p_radius_meters, 5000), 50), 50000)
      )
    ORDER BY 2 ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.places_nearby (double precision, double precision, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.places_nearby (double precision, double precision, double precision, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Public photo bucket (reads public; writes service role only — no storage.objects policies)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('place-photos', 'place-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Feature flag (dark)
-- ---------------------------------------------------------------------------
INSERT INTO public.feature_flags (key, description, config)
VALUES (
    'click_places',
    'Click Places: Place pins, pages, check-in and Pulse (CLICK_PLACES_SPEC.md).',
    '{
      "checkin_ttl_minutes": 180,
      "gps_max_accuracy_meters": 100,
      "qr_gps_slack_multiplier": 3,
      "pulse_window_minutes": 90,
      "pulse_half_life_minutes": 30,
      "pulse_cooldown_minutes": 45,
      "pulse_edit_window_minutes": 15,
      "presence_encounter_window_minutes": 180,
      "would_return_window_minutes": 180,
      "last_pulse_lookback_hours": 168,
      "pattern_weeks": 8,
      "been_here_days": 90,
      "nearby_default_radius_meters": 5000,
      "nearby_max_radius_meters": 50000,
      "nearby_max_limit": 200
    }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
```

**W3 code change:** add `'click_places'` to `FEATURE_KEYS` in `lib/server/featureFlags.ts`.

### 3.4 Migration W9: maintenance

```sql
-- Click Places, step 4: manager-facing daily rollup + retention.

CREATE TABLE IF NOT EXISTS public.place_daily_stats (
    place_id                UUID NOT NULL REFERENCES public.places (id) ON DELETE CASCADE,
    day                     DATE NOT NULL,                         -- in places.timezone
    check_ins               INTEGER NOT NULL DEFAULT 0,
    unique_visitors         INTEGER NOT NULL DEFAULT 0,
    repeat_visitors         INTEGER NOT NULL DEFAULT 0,            -- visited this Place on an earlier day too
    check_ins_by_hour       INTEGER[] NOT NULL DEFAULT array_fill(0, ARRAY[24]),
    dwell_minutes_sum       INTEGER NOT NULL DEFAULT 0,            -- explicit check-outs only
    dwell_samples           INTEGER NOT NULL DEFAULT 0,
    pulses                  INTEGER NOT NULL DEFAULT 0,
    energy_counts           INTEGER[] NOT NULL DEFAULT array_fill(0, ARRAY[4]),   -- chill..packed
    talkable_yes            INTEGER NOT NULL DEFAULT 0,
    talkable_no             INTEGER NOT NULL DEFAULT 0,
    would_return_yes        INTEGER NOT NULL DEFAULT 0,
    would_return_no         INTEGER NOT NULL DEFAULT 0,
    event_check_ins         INTEGER NOT NULL DEFAULT 0,            -- check-ins during an official event window
    new_connections         INTEGER NOT NULL DEFAULT 0,
    repeat_connections      INTEGER NOT NULL DEFAULT 0,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (place_id, day)
);

ALTER TABLE public.place_daily_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_daily_stats FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.place_daily_stats TO service_role;

COMMENT ON TABLE public.place_daily_stats IS
    'Manager-facing aggregates per Place per local day. Counts only insights-eligible rows (count_for_insights). No user ids.';

CREATE OR REPLACE FUNCTION public.purge_place_presence (
    p_check_in_days INTEGER DEFAULT 90,
    p_pulse_identity_days INTEGER DEFAULT 30,
    p_pulse_days INTEGER DEFAULT 400
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closed INTEGER; v_deleted INTEGER; v_anonymized INTEGER; v_pulses_deleted INTEGER;
BEGIN
    UPDATE public.place_check_ins
    SET checked_out_at = expires_at, checkout_reason = 'expired'
    WHERE checked_out_at IS NULL AND expires_at IS NOT NULL AND expires_at <= now();
    GET DIAGNOSTICS v_closed = ROW_COUNT;

    DELETE FROM public.place_check_ins
    WHERE checked_at < now() - make_interval(days => p_check_in_days);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    UPDATE public.place_pulses
    SET user_id = NULL, check_in_id = NULL
    WHERE user_id IS NOT NULL AND created_at < now() - make_interval(days => p_pulse_identity_days);
    GET DIAGNOSTICS v_anonymized = ROW_COUNT;

    DELETE FROM public.place_pulses
    WHERE created_at < now() - make_interval(days => p_pulse_days);
    GET DIAGNOSTICS v_pulses_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'closed', v_closed, 'check_ins_deleted', v_deleted,
        'pulses_anonymized', v_anonymized, 'pulses_deleted', v_pulses_deleted
    );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_place_presence (integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_place_presence (integer, integer, integer) TO service_role;
```

### 3.5 Data dictionary: semantics you must not get wrong

| Field | Meaning |
|---|---|
| `place_check_ins.checked_at` | Check-in time (legacy column name; do not add a `checked_in_at`). |
| An **open** check-in | `checked_out_at IS NULL`. |
| An **active** check-in | Open **and** `expires_at > now()`. Code must always test both, because cron closes expired rows only hourly. |
| `checkout_reason` | `user` = tapped Leave; `expired` = TTL elapsed (set lazily or by purge); `superseded` = user checked in somewhere else. |
| `count_for_insights` | Snapshot of `users.location_include_in_insights_enabled` **at write time**. Manager stats count only `true` rows. |
| `share_with_connections` | This check-in may show the user's name in a connection's "Here now" list. Off by default. |
| `proof_weight` | Server-assigned (§4.4). Never trust a client-provided weight. |
| `place_pulses.energy` | 1 Chill, 2 Steady, 3 Lively, 4 Packed. NULL only on a would-return-only row. |
| `category_answer` | 1 / 2 / 3 means: `seats` plenty/some/none; `line` none/short/long; `wait` none/short/long; `equipment` none/some/long. |
| `places.hours` | `{"mon":[["07:00","15:00"]], "fri":[["07:00","15:00"],["18:00","02:00"]]}`. Keys `mon`…`sun`. Times are `HH:MM` 24 h in `places.timezone`. A close at or before the open means the next day. A missing key means closed. A null `hours` means unknown (`open_now` = null). |
| Official event | `map_beacons.beacon_type = 'event' AND venue_id = places.id`. |

---

## 4. Domain logic (`click-web/lib/places/*`, PR W4)

All of these are **pure** functions: no Supabase, no `server-only`, no `Date.now()` inside (take `nowMs` as a parameter). Each module gets a Jest file in `__tests__/lib/places/`. iOS re-implements only §4.6 (filters) and §4.11 (labels); everything else comes from the API.

| File | Exports |
|---|---|
| `lib/places/types.ts` | Shared TS types (`PlaceCategory`, `EnergyLevel`, `PlaceSummary`, `PlaceDetail`, `PulseSummary`, `PulseQuestion`, …): the API shapes in §5 |
| `lib/places/config.ts` | `PlacesConfig` type, `DEFAULT_PLACES_CONFIG`, `placesConfigFrom(config)` |
| `lib/places/categories.ts` | `PLACE_CATEGORIES`, `categoryLabel`, `categoryQuestionKey` |
| `lib/places/slug.ts` | `slugifyPlaceName`, `isValidSlug` |
| `lib/places/geofence.ts` | `distanceBucket`, `accuracyBucket`, `evaluateGpsProof`, `evaluateQrProof` |
| `lib/places/presence.ts` | `resolvePresence` |
| `lib/places/pulse.ts` | `PULSE_QUESTIONS_VERSION`, `pulseQuestionsFor`, `summarizePulse`, `pulsePattern`, `energyLabel` |
| `lib/places/hours.ts` | `parsePlaceHours`, `isOpenAt`, `todayHoursLabel` |
| `lib/places/filters.ts` | `PlaceFilters`, `parsePlaceFilters`, `applyPlaceFilters` |
| `lib/places/rollup.ts` | `rollupPlaceDay` (W9) |

### 4.1 Config (`config.ts`)

```ts
export type PlacesConfig = {
  checkinTtlMinutes: number;              // 180   [30, 480]
  gpsMaxAccuracyMeters: number;           // 100   [25, 200]
  qrGpsSlackMultiplier: number;           // 3     [1, 10]
  pulseWindowMinutes: number;             // 90    [15, 360]
  pulseHalfLifeMinutes: number;           // 30    [5, 180]
  pulseCooldownMinutes: number;           // 45    [5, 240]
  pulseEditWindowMinutes: number;         // 15    [1, 60]
  presenceEncounterWindowMinutes: number; // 180   [15, 720]
  wouldReturnWindowMinutes: number;       // 180   [15, 720]
  lastPulseLookbackHours: number;         // 168   [1, 720]
  patternWeeks: number;                   // 8     [1, 26]
  beenHereDays: number;                   // 90    [7, 365]
  nearbyDefaultRadiusMeters: number;      // 5000  [50, 50000]
  nearbyMaxRadiusMeters: number;          // 50000 [50, 50000]
  nearbyMaxLimit: number;                 // 200   [1, 200]
};
```

`placesConfigFrom(raw)` maps each snake_case key from the flag config (§3.3, step 10) using `configNumber(raw, key, default, {min, max})` with the bounds above. Import `configNumber` from `lib/server/featureFlags.ts` in the *server* wrapper only. In `config.ts`, write a tiny local clamp so the module stays pure.

### 4.2 Slugs (`slug.ts`)

- `slugifyPlaceName(name, city?)`: lowercase, NFKD-normalize, strip diacritics, replace `&` with `and`, replace any run of non `[a-z0-9]` with `-`, trim `-`, cut to 60 chars at a `-` boundary. If `city` is given, append `-` + slugified city. Example: `"Café Allegro", "Seattle"` → `cafe-allegro-seattle`.
- `isValidSlug(s)`: matches `^[a-z0-9]+(-[a-z0-9]+)*$` and length 3–80 (same as the DB constraint).
- Collisions are resolved by the server: try `slug`, then `slug-2`, `slug-3`, … up to `-20`; after that, fail with 409.

### 4.3 Pulse questions (`pulse.ts`)

`PULSE_QUESTIONS_VERSION = 1`. `pulseQuestionsFor(category)` returns `PulseQuestion[]`:

```ts
type PulseQuestion = {
  key: 'energy' | 'talkable' | 'category' | 'would_return';
  category_question?: 'seats' | 'line' | 'wait' | 'equipment';  // only when key === 'category'
  prompt: string;
  required: boolean;
  phase: 'present' | 'leaving';
  options: { value: number; label: string }[];
};
```

| key | phase | required | prompt | options |
|---|---|---|---|---|
| `energy` | present | yes | "How's the energy?" | 1 Chill · 2 Steady · 3 Lively · 4 Packed |
| `category` (seats) | present | no | "Seats available?" | 1 Plenty · 2 Some · 3 None |
| `category` (line) | present | no | "Line at the door?" | 1 None · 2 Short · 3 Long |
| `category` (wait) | present | no | "Wait for a table?" | 1 None · 2 Short · 3 Long |
| `category` (equipment) | present | no | "Wait for equipment?" | 1 None · 2 Some · 3 Long |
| `talkable` | present | no | "Easy to talk here?" | 1 Yes · 0 No |
| `would_return` | leaving | no | "Come back at this time?" | 1 Yes · 0 No |

Order for `present`: `energy`, then the category question if the category has one (§1.3), then `talkable`. `leaving` has only `would_return`.

### 4.4 Presence and proof weights (`geofence.ts`, `presence.ts`)

**Buckets**

- `distanceBucket(m)`: `<25` → `0_25`, `<75` → `25_75`, `<150` → `75_150`, `<400` → `150_400`, else `400_plus`.
- `accuracyBucket(m | null)`: null or `≥100` → `100_plus`, `<20` → `0_20`, `<50` → `20_50`, else `50_100`.

**GPS check-in** — `evaluateGpsProof({ place, lat, lng, accuracy, config })`:

1. If `lat`/`lng` are missing, or `isValidCheckInCoordinate` fails (from `lib/server/eventEngagement.ts`; copy it into `geofence.ts` if importing it breaks purity) → reject `no_location`.
2. If `accuracy == null || accuracy > config.gpsMaxAccuracyMeters` → reject `low_accuracy`.
3. `d = haversineMeters(lat, lng, place.latitude, place.longitude)`. If `d > place.radius_meters + min(accuracy, 50)` → reject `out_of_bounds` (also return `distance_meters`, so the client can say how far away).
4. Accept with `proof = 'gps'`, `weight = accuracy <= 50 ? 0.8 : 0.6`, plus `distance_bucket` and `accuracy_bucket`.

**QR check-in** — `evaluateQrProof({ place, anchor, lat?, lng?, accuracy?, config })`:

1. If `anchor` is missing, `anchor.venue_id !== place.id`, `anchor.purpose !== 'check_in'` or `!anchor.active` → reject `invalid_anchor`.
2. If a location was sent: compute `d`. If `d > place.radius_meters * config.qrGpsSlackMultiplier + min(accuracy ?? 100, 100)` → reject `out_of_bounds` (this stops a photographed QR code being used from home). Otherwise accept with `weight = 1.0`.
3. If no location was sent (permission denied) → accept with `weight = 0.6`, buckets null.

**Presence for Pulse** — `resolvePresence({ openCheckIn, eventCheckIn, recentEncounter, nowMs, config })` returns the **strongest** of:

| Source | Condition | proof | weight |
|---|---|---|---|
| Place check-in | the user's open check-in at this Place with `expires_at > now` | the row's `proof` | the row's `proof_weight` |
| Official event check-in | an `event_check_ins` row for the user with `checked_out_at IS NULL`, on a beacon with `venue_id = place.id` that is live now (`isEventLiveForCheckIn`) | `event` | 0.9 |
| Verified handshake here | a `connection_encounters` row with `place_id = place.id`, `reporting_user_id = user`, `encountered_at > now − presenceEncounterWindowMinutes` | `encounter` | 1.0 |

The result is `{ present: true, proof, weight, checkInId?, beaconId? }` or `{ present: false }`. On a tie, prefer the Place check-in (so the Pulse links to it).

### 4.5 Pulse summary (`pulse.ts`): no thresholds

Input: energy Pulses for one Place (`energy IS NOT NULL`) from the last `pulseWindowMinutes`, **excluding** rows from users who are managers of the Place (defensive; managers are already rejected at write time).

```
for each pulse i:
  age_i  = (now - created_at_i) in minutes
  w_i    = proof_weight_i * 0.5 ^ (age_i / pulseHalfLifeMinutes)
score    = Σ(w_i * energy_i) / Σ w_i                 (1.0 … 4.0)
label    = score < 1.75 → 'chill' | < 2.5 → 'steady' | < 3.25 → 'lively' | else 'packed'
confidence (descriptive only; NEVER used to hide anything):
         = n >= 8 && Σw >= 4 → 'high' | n >= 3 && Σw >= 1.5 → 'medium' | else 'low'
```

Output `PulseSummary`:

```ts
type PulseSummary = {
  state: 'live' | 'stale' | 'none';
  // live: at least 1 energy pulse in the window. stale: none in window, but one within
  // lastPulseLookbackHours. none: nothing in the lookback.
  label: 'chill' | 'steady' | 'lively' | 'packed' | null;   // live: weighted; stale: last pulse's energy
  energy_score: number | null;          // live only, rounded to 2 decimals
  report_count: number;                 // live: n in window; stale: 0
  newest_at: string | null;             // ISO of the newest energy pulse (live or stale)
  confidence: 'low' | 'medium' | 'high' | null;  // live only
  distribution: [number, number, number, number]; // raw counts chill..packed in window
  talkable: { yes: number; no: number };           // in window
  category: { question: 'seats'|'line'|'wait'|'equipment'; counts: [number, number, number] } | null;
  window_minutes: number;
};
```

**Pattern** — `pulsePattern(pulses, place.timezone, nowMs, patternWeeks)`: from energy Pulses in the last `patternWeeks × 7` days whose local weekday equals today's local weekday and whose local hour is within ±1 of the current local hour, return `{ label, report_count, weeks }`. Use the unweighted mean energy and the same label cut-offs. If there are 0 matching Pulses, return `null`. A count of 1 is still returned (no threshold).

**Tests (required):** single pulse → `live` with `report_count` 1 and `confidence` `'low'`; decay (one 80-min-old Packed and one fresh Chill → closer to chill); the stale branch; the none branch; the distribution is raw counts; the pattern matches weekday and hour in a non-UTC timezone (`America/Los_Angeles`, across a DST boundary).

### 4.6 Filters (`filters.ts`): the replacement for thresholds

```ts
type PlaceFilters = {
  categories: PlaceCategory[];          // [] = all
  pulseNow: boolean;                    // pulse.state === 'live'
  minReports: number;                   // 0 = any; else pulse.state==='live' && report_count >= minReports
  energies: EnergyLabel[];              // [] = any; else pulse.state==='live' && label ∈ energies
  eventsToday: boolean;                 // events_today_count > 0 || next_event?.is_live
  openNow: boolean;                     // open_now === true (null/unknown is excluded)
  beenHere: boolean;                    // viewer.has_history
  clicksBeenHere: boolean;              // viewer.connections_been_here_count > 0
  hasHub: boolean;                      // hub_id != null
  hereNow: boolean;                     // here_now_count > 0
};
export const NO_FILTERS: PlaceFilters;  // everything false / empty / 0
```

- `applyPlaceFilters(places, filters)`: AND across fields, OR within list fields. It preserves the input order.
- `parsePlaceFilters(searchParams)` reads query params: `category=cafe,bar`, `pulse_now=1`, `min_reports=3`, `energy=lively,packed`, `events_today=1`, `open_now=1`, `been_here=1`, `clicks_been_here=1`, `has_hub=1`, `here_now=1`. Unknown values are ignored, never 400.
- **iOS must implement the identical semantics** (§6.6). Add a shared fixture `__tests__/fixtures/places/filters.json` (an input list, a filter set and the expected ids) and copy it into `click-ios/Tests/ClickTests/Fixtures/place_filters.json`. Both test suites assert against it.

### 4.7 Here now, been here and own history (server; defined here)

- **Here now count** = distinct `user_id` with an **active** check-in at the Place, excluding ghost-mode users. The viewer counts as one if they are checked in. Shown at any value, including 1.
- **Here now names** (signed-in viewer only) = viewer's connections (`loadViewerPeers`) among those users whose check-in has `share_with_connections = true`, excluding ghost-mode and blocked users. Each is returned as `{ user_id, name, avatar_url }`, max 10, ordered by name.
- **Clicks who've been here** = viewer's connections with `users.place_visits_visible_to_connections = true` and `ghost_mode` not true, not blocked, who have **any** check-in at the Place in the last `beenHereDays`, **or** an encounter with `place_id = place` in that window where they are a member. Return `count` and up to 3 `names` **ordered by name** (never by recency). Never return dates for other people.
- **You met here** = the viewer's connections that have an encounter with `place_id = place` on a connection that includes the viewer: up to 5 `{ user_id, name, avatar_url, last_met_at }` ordered by `last_met_at` desc, plus `total`. This is the viewer's own data, so dates are allowed.
- **Own history** = `{ check_in_count, last_check_in_at, encounter_count }` over the retention window (90 days for check-ins, all time for encounters).

### 4.8 Hours (`hours.ts`)

- `parsePlaceHours(json)`: validates shape (§3.5) and returns `null` when invalid. Use Zod.
- `isOpenAt(hours, timezone, nowMs)`: returns `true` / `false`, or `null` when `hours` is null. Handle after-midnight intervals by also checking yesterday's intervals whose close is at or before their open.
- `todayHoursLabel(hours, timezone, nowMs)`: e.g. `"7 AM – 3 PM"`, `"7 AM – 3 PM, 6 PM – 2 AM"`, `"Closed today"`, or `null`.
- Use `Intl.DateTimeFormat` with `timeZone` for local weekday and time. Do not add a date library.

### 4.9 Rollup (`rollup.ts`, W9)

`rollupPlaceDay({ checkIns, priorVisitorIds, pulses, eventWindows, encounters, timezone })` → one `place_daily_stats` row (minus keys). Inputs are pre-filtered to one Place and one local day **and** to insights-eligible rows only:

- `check_ins` = number of check-ins; `unique_visitors` = distinct `user_id`; `repeat_visitors` = distinct users in `priorVisitorIds`.
- `check_ins_by_hour[h]` = check-ins whose local hour is `h`.
- Dwell: only rows with `checkout_reason = 'user'`. `dwell_minutes_sum` = Σ round((checked_out_at − checked_at)/60000), capped at 480 per row. `dwell_samples` = number of those rows.
- `pulses` = rows with energy; `energy_counts[energy-1]++`; `talkable_*`; `would_return_*` (from any row).
- `event_check_ins` = check-ins whose `checked_at` falls in any `[starts_at, ends_at]` of an official event that day.
- `new_connections` / `repeat_connections`: per distinct `connection_id` among encounters at the Place that day (only connections with `include_in_business_insights = true` and `source = 'handshake'`). It is "new" if that connection's earliest encounter anywhere is that day, else "repeat".

### 4.10 Insights eligibility (server rule)

A row counts in **manager-facing** numbers only if:
- check-ins and Pulses: `count_for_insights = true` (snapshotted at write from `users.location_include_in_insights_enabled`);
- connections: `connections.include_in_business_insights = true AND connections.source = 'handshake'`.

Consumer-facing numbers (Pulse summary, here now, pattern) use **all** rows (minus ghost-mode users for counts that name or count people).

### 4.11 Labels (shared copy)

| Value | Copy |
|---|---|
| Live Pulse | `"{Label} · {n} report{s} · {age}"`, e.g. "Lively · 1 report · 4 min ago" |
| Stale Pulse | `"Last Pulse: {Label} · {age}"`, e.g. "Last Pulse: Chill · 3 h ago" |
| No Pulse | `"No Pulse yet — be the first when you're here"` |
| Confidence chip | low → "Early read", medium → "Fair read", high → "Strong read" (shown next to live Pulse; informational) |
| Pattern | `"Usually {label} around now · {n} report{s} over {w} weeks"` |
| Here now | `"{n} here now"`; 0 → hide the row |
| Age | `<1 min` "just now"; `<60 min` "{m} min ago"; `<24 h` "{h} h ago"; else "{d} d ago" |

---

## 5. API (click-web, PRs W5–W7)

### 5.0 Common rules for every route in this section

- **Auth:** `getSupabaseFromRouteRequest(request)`. 401 `{ "error": "Unauthorized" }` when there's no user, unless the route says "anonymous OK".
- **Flag:** right after auth, `const gate = await requireFeature(admin, 'click_places', user.id); if (!gate.ok) return gate.response;`. Build `PlacesConfig` from `gate.config` with `placesConfigFrom`.
- **DB:** use `createAdminSupabaseClient()` for every read and write. Never return columns that aren't in the response shapes below. Serialization helpers live in `lib/server/places/serialize.ts`. There must be no `select('*')` passed straight to a response.
- **Place id parameter:** `[placeId]` accepts a UUID **or** a slug. Resolve with `loadPlaceByIdOrSlug(admin, idOrSlug)` (`lib/server/places/loadPlace.ts`). Consumer routes 404 `place_not_found` unless `listed = true AND verification_status = 'verified'`. Manager routes accept any status for managers.
- **Errors:** `apiError(message, status, code)`. Codes are listed per route. The iOS client switches on `code`.
- **Rate limits:** check-in POST: 10/min/user. Pulse POST/PATCH: 20/min/user. Nearby GET: 60/min/user. Use the existing `lib/server/rateLimit.ts` binding pattern (see the hub messages route); failing open when no binding exists is acceptable (as it is today).
- **Times:** ISO-8601 UTC strings. **Coordinates** in responses: Place center only. Never a user's.
- **Photo URL:** `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/place-photos/${photo_path}` or `null`.

Server modules for W5 (all `import 'server-only'`):

| File | Responsibility |
|---|---|
| `lib/server/places/loadPlace.ts` | `loadPlaceByIdOrSlug`, `isPlaceManager(admin, placeId, userId)` returning the role or null |
| `lib/server/places/serialize.ts` | `serializePlaceSummary`, `serializePlaceDetail`, `serializeManagerPlace` |
| `lib/server/places/enrich.ts` | Batch loaders for N places: pulses in window, active check-ins, events today/next, hub ids, viewer history and network counts. **One query per concern for the whole batch, never per place.** |
| `lib/server/places/checkIns.ts` | Check-in/out transactions (§5.4) |
| `lib/server/places/pulses.ts` | Pulse create/patch (§5.5) |
| `lib/server/places/stats.ts` | Manager stats (§5.8) |

### 5.1 Shapes

```jsonc
// PlaceSummary — used in lists and map pins
{
  "id": "6a1f…",                     // places.id (uuid)
  "slug": "cafe-allegro-seattle",
  "name": "Café Allegro",
  "category": "cafe",
  "photo_url": "https://…/place-photos/6a1f…/cover.jpg" ,  // or null
  "latitude": 47.6588, "longitude": -122.3131,
  "radius_meters": 75,
  "distance_meters": 412.3,          // only in nearby results, else null
  "address_line": "4214 University Way NE",   // falls back to legacy places.location
  "city": "Seattle",
  "open_now": true,                  // true | false | null (unknown hours)
  "pulse": { /* PulseSummary §4.5 */ },
  "here_now_count": 3,
  "events_today_count": 1,
  "next_event": { "beacon_id": "…", "title": "Open mic", "starts_at": "…", "ends_at": "…", "is_live": false }, // or null
  "hub_id": "place-6a1f…",          // or null
  "viewer": {                        // null for anonymous callers
    "checked_in": false,
    "has_history": true,
    "connections_been_here_count": 2
  }
}

// PlaceDetail = PlaceSummary + these fields
{
  "description": "…", "website_url": "https://…", "timezone": "America/Los_Angeles",
  "hours": { "mon": [["07:00","15:00"]] },  // or null
  "today_hours_label": "7 AM – 3 PM",       // or null
  "directions": {
    "apple_maps_url": "https://maps.apple.com/?daddr=47.6588,-122.3131&q=Caf%C3%A9%20Allegro",
    "google_maps_url": "https://www.google.com/maps/dir/?api=1&destination=47.6588,-122.3131"
  },
  "pattern": { "label": "lively", "report_count": 6, "weeks": 8 },  // or null
  "upcoming_events": [ { "beacon_id": "…", "title": "…", "starts_at": "…", "ends_at": "…", "is_live": true, "cover_theme_id": null } ], // max 10, official only
  "here_now_connections": [ { "user_id": "…", "name": "Maya", "avatar_url": null } ],   // viewer only; [] otherwise
  "clicks_been_here": { "count": 2, "names": ["Jordan", "Maya"] },                      // viewer only; null otherwise
  "you_met_here": { "total": 3, "people": [ { "user_id": "…", "name": "Maya", "avatar_url": null, "last_met_at": "…" } ] }, // viewer only; null otherwise
  "own_history": { "check_in_count": 4, "last_check_in_at": "…", "encounter_count": 2 }, // viewer only; null otherwise
  "check_in": {                       // viewer only; null otherwise
    "active": true, "check_in_id": "…", "checked_in_at": "…", "expires_at": "…",
    "proof": "gps", "share_with_connections": false
  },
  "pulse_eligibility": {              // viewer only; null otherwise
    "can_pulse": true,
    "reason": null,                   // "not_present" | "cooldown" | "manager" | null
    "cooldown_until": null,
    "questions": [ /* PulseQuestion[] phase=present §4.3 */ ],
    "leaving_questions": [ /* PulseQuestion[] phase=leaving */ ],
    "my_last_pulse": { "id": "…", "energy": 3, "created_at": "…", "editable_until": "…" } // or null
  },
  "hub": { "id": "place-6a1f…", "name": "Café Allegro", "joined": false } , // or null when no hub
  "is_manager": false
}
```

### 5.2 `GET /api/places/nearby`

Query: `lat`, `lon` (alias `lng`), `radius_meters` (default `nearbyDefaultRadiusMeters`, clamped to `[50, nearbyMaxRadiusMeters]`), `limit` (default 100, clamped to `[1, nearbyMaxLimit]`), plus the filter params of §4.6.

Steps:
1. Validate `lat`/`lon` as finite numbers → else 400 `invalid_coordinates`.
2. `admin.rpc('places_nearby', { p_lat, p_lng, p_radius_meters, p_limit })` → ids and distances.
3. Load those `places` rows (only the columns needed for `PlaceSummary`).
4. Enrich in batch (`enrich.ts`): Pulses in window and lookback, active check-ins (count, excluding ghosts), viewer's own check-in state, events (official, `beacon_type = 'event'`, `venue_id in ids`, ending after now, starting before local end of day for `events_today_count`; also the next upcoming), hubs (`hub_venues where place_id in ids`), viewer history flags (any own check-in in 90 days or any own encounter at the Place), and `connections_been_here_count` (§4.7).
5. Serialize, then `applyPlaceFilters` with the parsed query filters. Keep the RPC's distance order.

Response `200 { "places": PlaceSummary[] }`. Errors: 400 `invalid_coordinates`, 404 (flag off).

### 5.3 `GET /api/places/[placeId]`

Returns `200 { "place": PlaceDetail }` for a signed-in caller. Pulse uses all rows. Upcoming events pass through `filterBeaconsForViewer`, so connection-only events stay hidden from strangers. `pulse_eligibility` uses `resolvePresence` (§4.4), the cooldown (the user's newest energy Pulse at this Place is younger than `pulseCooldownMinutes` → `reason: 'cooldown'`, `cooldown_until`) and the manager check. Errors: 404 `place_not_found`.

**Anonymous variant (anonymous OK):** the web page calls `loadPublicPlace(admin, slug)` (`lib/server/places/publicPlace.ts`) directly, not over HTTP. It returns `PlaceDetail` with every viewer-only field null/`[]`, `viewer: null` and `here_now_count` included. It does **not** check the user feature flag. It does check `PLACES_PUBLIC_PAGES_ENABLED` (§7.1).

### 5.4 Check-in: `POST | GET | DELETE /api/places/[placeId]/check-in`

**POST** body (Zod `placeCheckInBodySchema` in `lib/api/schemas/places.ts`; accept `lat`/`lng`/`lon` aliases like `engagementTelemetryBodySchema`):

```jsonc
{
  "latitude": 47.6589, "longitude": -122.3130, "accuracy_meters": 18,   // optional when anchor_token is sent
  "anchor_token": "b3c1…",          // optional: nfc_anchors.qr_token from the QR code
  "share_with_connections": false,  // optional, default false
  "platform": "ios", "app_version": "1.9.0"
}
```

Steps:
1. Load the Place (listed + verified) → else 404 `place_not_found`.
2. If `anchor_token` is present: load `nfc_anchors` by `qr_token` and run `evaluateQrProof`. Otherwise run `evaluateGpsProof`. On reject: 422 with `code` = `no_location | low_accuracy | out_of_bounds | invalid_anchor`, and body `{ error, code, distance_meters? }`. **Store nothing about a rejected attempt** except `emitProductEvent('place_check_in_rejected', { reason })` (§10).
3. Close the user's stale open check-ins at **this** Place (`expires_at <= now` → `checked_out_at = expires_at, checkout_reason = 'expired'`).
4. Close the user's active check-ins at **other** Places (`checked_out_at = now, checkout_reason = 'superseded'`). A person is in one Place at a time.
5. If an active check-in at this Place exists: update `expires_at = now + checkinTtlMinutes`, `share_with_connections` (if sent), and the proof if the new weight is higher. Return 200 with `"refreshed": true`.
6. Otherwise insert `{ place_id, user_id, checked_at: now, expires_at, proof, proof_weight, anchor_id, distance_bucket, accuracy_bucket, share_with_connections, count_for_insights: users.location_include_in_insights_enabled === true, platform, app_version }`. On a unique-index violation (a race), re-read and treat it as a refresh.
7. If the Place has a hub (`hub_venues.place_id`), upsert `hub_participants (hub_id, user_id)` so the user can open the Place Hub right away. This is the same membership model as standalone hubs. It is not revoked on check-out.
8. `emitProductEvent('place_check_in', { proof })`.

Response 200:

```json
{ "checked_in": true, "refreshed": false, "check_in_id": "…", "checked_in_at": "…", "expires_at": "…",
  "proof": "gps", "share_with_connections": false, "hub_id": "place-6a1f…", "here_now_count": 4 }
```

**GET** returns 200 with the same shape for the active check-in, or `{ "checked_in": false }`.

**DELETE** sets `checked_out_at = now, checkout_reason = 'user'` on the active row. Response: `{ "checked_in": false, "ask_would_return": true }`. `ask_would_return` is true when the user has no `would_return` Pulse at this Place in the last `wouldReturnWindowMinutes`. If there was no active row: 200 `{ "checked_in": false, "ask_would_return": false }` (idempotent).

### 5.5 Pulse: `POST /api/places/[placeId]/pulse`, `PATCH /api/places/[placeId]/pulse/[pulseId]`

**POST** body:

```jsonc
{ "energy": 3, "talkable": 1, "category_answer": 2, "would_return": null, "question_version": 1 }
```

Rules, in this order:
1. Place loaded (listed + verified) → else 404.
2. The caller is a manager of this Place → 403 `manager_pulse_not_allowed`.
3. At least one of `energy` / `would_return` is present → else 400 `empty_pulse`. Validate ranges (§3.3) → 400 `invalid_answer`. `category_answer` is accepted only if the Place category has a category question; set `category_question` from the category on the server.
4. **Presence.** If `energy` is present: `resolvePresence` must be present → else 403 `not_present`. If it is *only* `would_return`: allowed if present **or** the user has a check-in at this Place with `checked_out_at` within the last `wouldReturnWindowMinutes` → else 403 `not_present`.
5. **Cooldown** (only when `energy` is present): if the user's newest energy Pulse here is younger than `pulseCooldownMinutes` → 429 `pulse_cooldown` with `cooldown_until`.
6. Insert with `proof`/`proof_weight`/`check_in_id`/`beacon_id` from presence. For would-return-only rows without presence, use the last check-in's proof and weight. Set `count_for_insights` from the user's setting.
7. `emitProductEvent('place_pulse', { has_energy, has_followup })`.

Response 201: `{ "pulse": { "id": "…", "editable_until": "…" }, "summary": PulseSummary }`. The client replaces its Pulse UI with the returned summary.

**PATCH** `/pulse/[pulseId]` body `{ "talkable"?: 0|1, "category_answer"?: 1|2|3 }`. It is allowed only for the author, only within `pulseEditWindowMinutes` of `created_at`, and only to fill fields that are still null. Otherwise: 404 `pulse_not_found`, 409 `pulse_not_editable`. Response: `{ "summary": PulseSummary }`.

### 5.6 `GET /api/me/places`

The viewer's own Place history. Response `{ "places": [ { "place": PlaceSummary, "check_in_count": 4, "last_check_in_at": "…", "encounter_count": 2 } ] }`. It covers Places where the viewer has a check-in (retention window) or an encounter, ordered by most recent activity, max 50. Only listed Places are included.

### 5.7 Manager: `GET /api/places/mine`, `PATCH /api/places/[placeId]`, `POST /api/places/[placeId]/photo`

All require a `place_managers` row for the caller (`isPlaceManager`). **These are not gated by the user feature flag**, so business owners can prepare their Place before consumer launch. They return 403 `not_a_manager` otherwise.

- **GET `/api/places/mine`** → `{ "places": [ { "id", "slug", "name", "category", "verification_status", "listed", "hub_enabled", "photo_url", "role", "subscription_status" } ] }`.
- **PATCH** (role `owner` or `manager`; `viewer` → 403) accepts only: `description` (≤500), `hours` (validated by `parsePlaceHours`; 400 `invalid_hours`), `website_url` (https only), `hub_enabled` (bool), `address_line`, `city`, `region`, `postal_code`. **Name, slug, category, coordinates, radius, verification and listing are admin-only in v1.**
  - When `hub_enabled` flips to true: if no hub exists, create one through the existing hub creation logic (extract the insert from `app/api/hub/create/route.ts` into `lib/server/hubCreate.ts` and call it). Use: id `place-${place.id}`, `name = place.name`, `category = place.category`, the Place's lat/lng/radius, `creator_id = caller`, `place_id = place.id`, `expires_at = null`. Add the caller as a participant.
  - When it flips to false: keep the hub row (history is preserved) but the Place stops surfacing it. Detail returns `hub: null`, and join is refused with 410 `hub_disabled` (add that check to `app/api/hub/join/route.ts` and `messages` POST for hubs with `place_id` whose Place has `hub_enabled = false`).
  - Response: `{ "place": ManagerPlace }` (the GET shape plus the editable fields).
- **POST `/photo`** accepts the same JSON base64 body as `app/api/beacons/image/route.ts` (reuse `avatarJsonBodySchema`). Max 5 MB; jpeg/png/webp. Upload to bucket `place-photos` at `${placeId}/cover-${Date.now()}.${ext}` with the admin client, set `photo_path`, and delete the previous object. Response `{ "photo_url": "…" }`.

### 5.8 Manager stats: `GET /api/places/[placeId]/stats?range=30d|90d&detail=basic|full`

- Manager role of any kind → else 403. `detail=full` additionally requires `userMayAccessBusinessInsights(supabase, user)` → else 402 `insights_required`.
- Source: `place_daily_stats` for completed days, plus a live computation of *today* from raw rows using `rollupPlaceDay`. All counts use only insights-eligible rows (§4.10). **No user ids, names or per-visit timestamps are ever returned.** No minimum counts (rule 3).

```jsonc
{
  "range_days": 30,
  "totals": { "check_ins": 212, "unique_visitors": 140, "repeat_visitor_rate": 0.31,
              "pulses": 96, "events_hosted": 4, "new_connections": 18, "repeat_connections": 7 },
  "check_ins_by_dow_hour": [[0,0,…24], … 7 rows Mon..Sun],    // local time
  "energy_distribution": [12, 40, 33, 11],
  "talkable": { "yes": 50, "no": 9 },
  "would_return": { "yes": 31, "no": 4 },
  // detail=full only:
  "daily": [ { "day": "2026-10-01", "check_ins": 8, "unique_visitors": 7, "pulses": 3, "avg_energy": 2.7 } ],
  "median_dwell_minutes": 52,          // from explicit check-outs only; null if none
  "event_vs_regular": { "event_check_ins": 61, "regular_check_ins": 151 },
  "pulse_by_daypart": { "morning": [..4], "afternoon": [..4], "evening": [..4], "night": [..4] }
}
```

`repeat_visitor_rate` = Σ repeat_visitors / Σ unique_visitors over the range (approximate; document this in a code comment). Dayparts: morning 05–11, afternoon 11–17, evening 17–22, night 22–05 (local). `median_dwell_minutes` is computed from raw check-ins in range (retention allows 90 d).

### 5.9 Manager QR poster: `GET /api/places/[placeId]/anchors`

Manager only. Returns the active check-in anchors: `{ "anchors": [ { "id", "name", "check_in_url": "https://joinclick.co/p/{slug}?t={qr_token}" } ] }`. The poster page (§7.2) renders the QR client-side. Before adding a dependency, check whether the repo already has a QR library (`grep -rn "qrcode" package.json`). The QR screen already exists, so one is likely present; reuse it.

### 5.10 Admin (server actions, not HTTP routes)

In `app/(admin)/admin/places/actions.ts`, each action starts with `requireAdminSession()` and ends with `revalidatePath('/admin/places')` + `redirectWithStatus`:

| Action | Effect |
|---|---|
| `createPlaceAction` | Insert a place: name, category, latitude, longitude, radius (default 75), timezone, address fields, website. The slug comes from `slugifyPlaceName(name, city)` with collision suffixing. `verification_status = 'verified'`, `verified_at = now`, `verified_by = admin`, `listed = false`. |
| `updatePlaceAction` | Edit any profile field including coordinates and radius. If coordinates or radius changed **and** the place is verified, call `rpc('backfill_place_encounters', { p_place_id })`, and update the Place Hub geofence (`hub_venues.geofence_lat/long/radius_meters`). |
| `setPlaceListedAction` | Toggle `listed`. The DB constraint rejects listing an incomplete Place; show the error. |
| `setVerificationAction` | `verified` / `suspended`. Suspending also sets `listed = false`. |
| `addPlaceManagerAction` | Find the user by email (`auth.admin.listUsers`, or the existing admin lookup helper in `lib/server/admin/`) and upsert `place_managers (user_id, place_id, role)`. |
| `removePlaceManagerAction` | Delete the row. Refuse if it is the last `owner`. |
| `createAnchorAction` | Insert `nfc_anchors { venue_id: place.id, name, map_x: 0, map_y: 0, purpose: 'check_in' }`. |
| `rotateAnchorAction` | `qr_token = gen_random_uuid()` (do it via an `rpc` or by generating a UUID in JS) and `rotated_at = now`. |
| `deactivateAnchorAction` | `active = false`. |
| `backfillEncountersAction` | `rpc('backfill_place_encounters')`; show the count. |
| `setHubEnabledAction` | Same behavior as the manager PATCH `hub_enabled`. |

### 5.11 Changes to existing routes (W7)

1. **Event detail and list responses** (`GET /api/beacons/[beaconId]`, `GET /api/beacons`, `GET /api/beacons/public-events`, and `loadPublicEventPayload`): when `venue_id` is set **and** that Place is listed and verified, add `"place": { "id", "slug", "name", "category" }`. Otherwise `"place": null`. Batch-load places by id for lists. This is additive, so older clients ignore it.
2. **`POST /api/hub/create`**: if the requested center is inside the radius of a **listed** Place (`rpc('resolve_place_at')`) that has `hub_enabled = true`, return 409 `place_hub_exists` with `{ place_id, slug, hub_id }`. Otherwise behave exactly as today.
3. **Reconnect nudge** (`lib/server/reconnectNearby.ts`): when the chosen encounter has `place_id` of a listed Place, set `place_name` to the Place's name and add `place_id` + `place_slug` to `ReconnectNudgePayload` (additive).
4. **`app/api/insights/[venueId]/route.ts` connection metrics:** after W3, connections can be attributed through encounters. Add `connections_via_place_encounters`: the distinct `connection_id` count of encounters with `place_id = venueId` in the last 30 days whose connection has `include_in_business_insights = true` and `source = 'handshake'`. Leave the existing fields unchanged.

---

## 6. iOS (`click-ios`, PRs I1–I4)

### 6.1 Flag, models and repository (I1)

**Flag.** In `Click/Core/Config/FeatureFlags.swift` add `case clickPlaces = "click_places"` to `FeatureFlags.Key`. Every Places surface checks `env.features.isEnabled(.clickPlaces)`.

**New folder `Click/Core/Places/`:**

`Place.swift`: value types mirroring §5.1. They are `Codable, Equatable, Sendable`. Decode them with explicit `static func decode(_ row: [String: Any]) -> Self?` functions using `JSONFields`, the same style as `MapBeacon.decode`. Unknown enum strings map to a fallback case; they never fail decoding.

```swift
public enum PlaceCategory: String, Codable, CaseIterable, Sendable {
    case cafe, bar, nightlife, musicVenue = "music_venue", restaurant, gym, coworking,
         studySpace = "study_space", entertainment, bookstore, campusSpace = "campus_space", other
    public var label: String { … }        // §1.3
    public var symbol: String { … }       // §1.3 SF Symbols
}

public enum EnergyLabel: String, Codable, CaseIterable, Sendable {
    case chill, steady, lively, packed
    public var title: String { rawValue.capitalized }
    public var value: Int { … }           // 1...4
}

public struct PulseSummary: Codable, Equatable, Sendable {
    public enum State: String, Codable, Sendable { case live, stale, none }
    public enum Confidence: String, Codable, Sendable { case low, medium, high }
    public let state: State
    public let label: EnergyLabel?
    public let energyScore: Double?
    public let reportCount: Int
    public let newestAt: Date?
    public let confidence: Confidence?
    public let distribution: [Int]       // 4
    public let talkableYes: Int
    public let talkableNo: Int
    public let categoryQuestion: String?
    public let categoryCounts: [Int]?    // 3
    public let windowMinutes: Int
}

public struct PlaceEventRef: Codable, Equatable, Identifiable, Sendable {
    public let beaconID: String; public let title: String
    public let startsAt: Date?; public let endsAt: Date?; public let isLive: Bool
    public var id: String { beaconID }
}

public struct PlaceViewerFlags: Codable, Equatable, Sendable {
    public let checkedIn: Bool; public let hasHistory: Bool; public let connectionsBeenHereCount: Int
}

public struct PlaceSummary: Codable, Equatable, Identifiable, Sendable {
    public let id: String; public let slug: String; public let name: String
    public let category: PlaceCategory; public let photoURL: URL?
    public let latitude: Double; public let longitude: Double; public let radiusMeters: Int
    public let distanceMeters: Double?; public let addressLine: String?; public let city: String?
    public let openNow: Bool?; public let pulse: PulseSummary
    public let hereNowCount: Int; public let eventsTodayCount: Int
    public let nextEvent: PlaceEventRef?; public let hubID: String?
    public let viewer: PlaceViewerFlags?
    public var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }
}

public struct PulseQuestion: Codable, Equatable, Identifiable, Sendable {
    public struct Option: Codable, Equatable, Hashable, Sendable { public let value: Int; public let label: String }
    public let key: String               // "energy" | "talkable" | "category" | "would_return"
    public let categoryQuestion: String?
    public let prompt: String; public let required: Bool; public let phase: String
    public let options: [Option]
    public var id: String { key }
}

public struct PlaceDetail: Equatable, Sendable {
    public let summary: PlaceSummary
    public let description: String?; public let websiteURL: URL?; public let todayHoursLabel: String?
    public let appleMapsURL: URL?; public let googleMapsURL: URL?
    public let pattern: (label: EnergyLabel, reportCount: Int, weeks: Int)?  // use a small struct instead of a tuple so it is Equatable
    public let upcomingEvents: [PlaceEventRef]
    public let hereNowConnections: [PlacePerson]
    public let clicksBeenHere: (count: Int, names: [String])?               // small struct
    public let youMetHere: (total: Int, people: [PlacePerson])?             // small struct
    public let ownHistory: PlaceOwnHistory?
    public let checkIn: PlaceCheckInState?
    public let pulseEligibility: PulseEligibility?
    public let hub: (id: String, name: String, joined: Bool)?               // small struct
    public let isManager: Bool
}
```

(Replace each tuple above with a named `struct`. The tuples only show the fields. The others, `PlacePerson`, `PlaceOwnHistory`, `PlaceCheckInState` and `PulseEligibility`, mirror §5.1 one-to-one.)

**`PlaceRepository.swift`** (`public final class`, same shape as `HubRepository`):

```swift
func nearby(around: CLLocationCoordinate2D, radiusMeters: Int) async throws -> [PlaceSummary]   // GET /api/places/nearby (no filter params; filtering is client-side)
func detail(idOrSlug: String) async throws -> PlaceDetail                                      // GET /api/places/{id}
func checkIn(placeID: String, coordinate: CLLocationCoordinate2D?, accuracy: Double?, anchorToken: String?, shareWithConnections: Bool) async throws -> PlaceCheckInState
func checkInStatus(placeID: String) async throws -> PlaceCheckInState?
func checkOut(placeID: String) async throws -> (askWouldReturn: Bool)
func submitPulse(placeID: String, energy: Int?, talkable: Int?, categoryAnswer: Int?, wouldReturn: Int?) async throws -> (pulseID: String, editableUntil: Date, summary: PulseSummary)
func updatePulse(placeID: String, pulseID: String, talkable: Int?, categoryAnswer: Int?) async throws -> PulseSummary
func myPlaces() async throws -> [MyPlaceVisit]                                                  // GET /api/me/places
```

Map API error `code`s to a `PlaceError` enum: `.notFound`, `.noLocation`, `.lowAccuracy`, `.outOfBounds(distance: Double?)`, `.invalidAnchor`, `.notPresent`, `.cooldown(until: Date?)`, `.managerPulseNotAllowed`, `.emptyPulse`, `.network`. Follow the pattern of `EventEngagementRepository.checkInError` (`Click/Core/Beacons/EventEngagementRepository.swift` ~L229).

**AppEnvironment.** Add `public let places: PlaceRepository`, built next to `hubs` with the same `resolvedAPI`.

### 6.2 Routes and deep links (I1)

- `AppRoute`: add `case place(idOrSlug: String, anchorToken: String?)`. `canonicalTab` → `.map`.
- `AppRouteDestination`: `.place(let id, let token)` → `PlaceDetailView(idOrSlug: id, anchorToken: token)`.
- `AppRouter.parseIncomingURL`:
  - `click://p/{slug}` and `click://p/{slug}?t={token}` → `.place(idOrSlug: slug, anchorToken: t)`.
  - `https://joinclick.co/p/{slug}` (any host the router already accepts for `/e/`) with an optional `t` → the same.
- `MapSelection`: add `case place(String)`.
- `MapItem.route` for a place → `.place(idOrSlug: place.id, anchorToken: nil)`.
- **QR scanner** (`AddClickView.handleScan`): **before** `parseInvocation`, if `URL(string:)` parses and `env.router.parseIncomingURL(url)` returns `.place` **and** the flag is on, close the scanner and `env.router.navigate(to: route)`. If the flag is off, fall through to the existing "That isn't a Click connection code." message.
- **App Clip** (`ClickClip/ClipApp.swift`): **out of scope for v1.** If the full app isn't installed, the universal link opens the web page `/p/{slug}`, which offers the App Store link (§7.1).
- `AppRouterTests`: add cases for all URL forms above, including a slug with digits and a missing `t`.

### 6.3 Discovery wiring (I1)

`NearbyDiscovery` (in `BeaconRepository`) gets `public let places: [PlaceSummary]`. **Decode it with `decodeIfPresent(...) ?? []`** so cached discoveries from older builds still load. In `BeaconRepository.discovery`, when Places are enabled (pass a `includePlaces: Bool` parameter from the caller, which reads the flag), fetch `env.places.nearby` concurrently with hubs, as an enrichment: on failure use `[]` and never fail the whole discovery.

### 6.4 Place detail screen (I3)

New folder `Click/Features/Places/`. `PlaceDetailView.swift` + `PlaceDetailModel.swift` (`@Observable @MainActor`).

**Model state:** `detail: PlaceDetail?`, `loadState: idle | loading | loaded | failed(String)`, `checkInPhase: idle | locating | submitting | failed(PlaceError)`, `pulsePhase: idle | submitting | submitted(pulseID, editableUntil) | failed(PlaceError)`, `pendingAnchorToken: String?`, `showWouldReturn: Bool`.

**Load:** `.task { await model.load() }` calls `detail(idOrSlug:)`. Pull-to-refresh reloads. While a check-in is active, the model refreshes `detail` every 60 s, but only while the view is visible. This is a foreground timer; there is no background work.

**Layout:** a `List` with `.insetGrouped`. Sections appear in this order and are hidden when empty unless noted.

1. **Header** (not a list row): `photo_url` hero (16:9, `AsyncImage`, category-symbol placeholder), name (`.title2.bold`), "Category · City", `todayHoursLabel` with an "Open"/"Closed" chip when `openNow != nil`.
2. **Now** (always shown):
   - Live: a large energy pill ("Lively") + "1 report · 4 min ago" + the confidence chip (§4.11) + a 4-bar distribution (raw counts). If there are category counts: "Seats: Plenty 2 · Some 1 · None 0". If talkable has responses: "Easy to talk: 3 yes · 1 no".
   - Stale: "Last Pulse: Chill · 3 h ago".
   - None: "No Pulse yet — be the first when you're here".
   - Below, if `pattern != nil`: "Usually Lively around now · 6 reports over 8 weeks".
   - If `hereNowCount > 0`: "3 here now". If `hereNowConnections` is non-empty: avatar stack + "Maya and Jordan are here".
3. **Your visit** (always shown for signed-in users): see §6.7 for check-in UI and §6.8 for the Pulse card.
4. **Happening here:** `upcomingEvents`, each row → `.event(beaconID:)`. A live event shows a "Live" chip.
5. **Your Clicks:** `clicksBeenHere` → "Maya, Jordan and 1 other have been here". `youMetHere` → "You met Maya, Sam and 1 other here" (tap → a sheet listing people with "last met" dates; each row → `.userProfile`). Hidden when both are nil or empty.
6. **Your history:** `ownHistory` → "You've checked in 4 times · Last on Sep 28". Hidden when `checkInCount == 0 && encounterCount == 0`.
7. **Community:** shown when `hub != nil`: a "Place Hub" row → `.hub(hubID:)`. If not `joined`, it shows "Check in to join".
8. **About:** description, website link, address with "Directions" (`appleMapsURL` via `openURL`; a long-press menu offers Google Maps).
9. **Manager note:** shown when `isManager`: "You manage this Place. Edit it on joinclick.co/business." (a link). Pulse controls are hidden for managers.

**Toolbar:** a share button that shares `https://joinclick.co/p/{slug}` (no anchor token, ever).

### 6.5 Map integration (I2)

**`MapBeacon.swift`:**
- Add `case places` to `MapLayer` (label "Places", symbol `building.2.fill`). Add it to `allCases` ordering after `events`.
- Parse `venue_id` into a new `public let venueID: String?` on `MapBeacon` (`JSONFields.string(row, "venue_id")`; the beacons list already returns it). Also parse the new `place` object from §5.11 into `public let place: (id, slug, name)?` (use a small struct).

**`MapFeatureModel.swift`:**
- `MapItem.Kind`: add `case place(PlaceSummary)`. Its `id` is `.place(place.id)`, its coordinate is the Place coordinate, its layer `.places`, its title `place.name`, and its subtitle the pulse/next-event line (live pulse label + count, else next event "Tonight 8 PM", else the category label).
- In `items(pins:applyingFilter:now:)`: when Places are enabled, append `discovery.places.map { MapItem(kind: .place($0)) }`, after applying `placeFilters` (§6.6). **Event merge:** remove any `.beacon` item whose `beacon.venueID` is the id of a Place present in the list. The Place pin carries it as a badge.
- Selection: `.place(id)` → route `.place`.

**`ClickMapView.swift`:** add a `PlacePin` view for `.place` items:
- 34×34 rounded square (corner radius 9), filled with the design system's surface color, a 1.5 pt border, and the category SF Symbol (or a 30×30 `photo_url` thumbnail if present).
- **Energy ring:** only when `pulse.state == .live`. A 3 pt stroke around the square in the energy color: chill = `.blue`, steady = `.green`, lively = `.orange`, packed = `.purple`. Use the design-system color tokens if equivalents exist in `Click/DesignSystem`.
- **Badge** (top-right): "LIVE" when `nextEvent?.isLive`, else a short start time ("8 PM") when `eventsTodayCount > 0`, else none.
- Places participate in the existing clustering exactly like other items. Do not special-case them.

### 6.6 Filters (I2)

New file `Click/Features/Places/PlaceFilters.swift`:

```swift
public struct PlaceFilters: Codable, Equatable, Sendable {
    public var categories: Set<PlaceCategory> = []
    public var pulseNow = false
    public var minReports = 0          // UI choices: Any(0), 2+, 5+, 10+
    public var energies: Set<EnergyLabel> = []
    public var eventsToday = false
    public var openNow = false
    public var beenHere = false
    public var clicksBeenHere = false
    public var hasHub = false
    public var hereNow = false
    public static let none = PlaceFilters()
    public var isActive: Bool { self != .none }
    public func matches(_ place: PlaceSummary) -> Bool   // identical semantics to §4.6
}
```

- Stored on `MapFeatureModel` as `var placeFilters: PlaceFilters` and persisted in `UserDefaults` as JSON under `places.filters.v1`. Reads and writes are wrapped in `try?`; a corrupt value falls back to `.none`.
- **NearbySheet:** when the Places layer is selected (or always, in a "Places" section header), show a horizontal chip row: `Pulse now`, `Lively+` (sets `energies = [.lively, .packed]`), `Quiet` (sets `[.chill, .steady]`), `Events today`, `Open now`, `Been here`, `Clicks have been`, then a `More…` chip that opens a sheet with every filter including categories and "Minimum reports". Active chips are filled. A "Clear" chip appears when `isActive`.
- The **Places** section of NearbySheet lists filtered Places sorted by: live event first, then live Pulse (newest first), then distance.
- `PlaceFilterTests.swift` loads `Fixtures/place_filters.json` (§4.6) and asserts the same matched ids as the web test.

### 6.7 Check-in flow (I3)

"Your visit" section states:

| State | UI |
|---|---|
| Not checked in | Primary button **"I'm here"** + toggle "Let my Clicks see I'm here" (default off, applies only to this check-in) |
| Locating / submitting | Button shows a progress view; disabled |
| Checked in | "Checked in · until 9:40 PM" + secondary button **"Leave"** + the Pulse card (§6.8) |
| Failed | Inline error text from the table below + "Try again" |

Tapping "I'm here":
1. If `pendingAnchorToken != nil` (opened from a QR code), request location anyway (§4.4 QR rule). If permission is denied or unavailable, send the token alone.
2. Otherwise request a **one-shot** location with `LocationProvider` exactly as the event check-in does. If permission is denied → `PlaceError.noLocation` and show "Turn on location to check in" with a Settings link.
3. Call `checkIn`. On success: haptic success, update `detail.checkIn`, reload `detail` (Pulse eligibility changes).

When the screen opens with `anchorToken`: show a confirmation sheet, "Check in at {name}?", with **Check in** and **Not now**. Never check in automatically without that tap.

Error copy:

| `PlaceError` | Copy |
|---|---|
| `.noLocation` | "Turn on location to check in." |
| `.lowAccuracy` | "We couldn't get a precise location. Step outside or near a window and try again." |
| `.outOfBounds(d)` | "You're about {d rounded to 50 m / 0.1 mi} away. Check in when you're here." |
| `.invalidAnchor` | "This code is no longer active. Ask staff for the current one." |
| `.notFound` | "This Place isn't available." |
| other | "Something went wrong. Try again." |

"Leave" calls `checkOut`. If `askWouldReturn`, show the leaving question (§6.8) inline for 30 s or until it is answered or dismissed.

### 6.8 Pulse card (I3)

Shown in "Your visit" when `pulseEligibility.canPulse == true`, or when `reason == .cooldown`.

- **Step 1:** the `energy` question as four large chips (Chill / Steady / Lively / Packed). One tap submits immediately (`submitPulse(energy:)`). The card then shows "Thanks — Pulse updated" and replaces the Now section's summary with the returned `summary`.
- **Step 2** (optional, same card, after submit): render the remaining `present` questions from `pulseEligibility.questions` (category, then talkable) as compact chip rows. Each tap calls `updatePulse` with that single field. Hide the row after answering. Hide the whole step when `editableUntil` passes.
- **Cooldown:** "You can update your Pulse at 9:12 PM" (from `cooldownUntil`); the chips are disabled.
- `reason == .notPresent` → card hidden (the check-in UI is the call to action).
- **Leaving question** (after "Leave" when `askWouldReturn`): "Come back at this time?" Yes / No / ✕. It calls `submitPulse(wouldReturn:)`.
- **Never** schedule a notification or background task to ask for Pulse.

### 6.9 Event detail link (I4)

In `BeaconDetailView`, when `beacon.place != nil` and the flag is on, add a row under the when/where line: building icon + "At {place.name}" → `.place(idOrSlug: place.id, anchorToken: nil)`.

### 6.10 Settings and Me (I4)

- **Settings → Privacy** (where `LocationPrivacy` toggles live): add a toggle "Show my Place visits to my Clicks" with footnote "Your Clicks see that you've been to a Place, never when." Store it in `users.place_visits_visible_to_connections` through the same REST read/write path as `LocationPrivacy`. Add a key `placeVisitsVisible = "place_visits_visible_to_connections"` to `LocationPrivacy.Key`, a property defaulting to `false`, and include it in `row`. Show it only when the Places flag is on.
- Show the existing "Business insights" toggle's footnote, updated: "Lets Places you visit count your check-ins and Pulses in their anonymous stats." (Only when the flag is on; otherwise unchanged.)
- **Me → History:** add a "Places" row (flag on) → `MyPlacesView`, a list from `myPlaces()`: each row has the Place name, "4 visits · Last Sep 28", "Met 2 people here", and opens `.place`.

### 6.11 Home (I4)

`ReconnectNearbyCard`: if the payload has `place_id`, make the place name tappable → `.place`. No other Home changes. **Do not add a Places feed to Home.**

---

## 7. Web UI (click-web, PR W8)

Use existing components (`components/fc` primitives such as `FcCard` and `FcButton`, `EventPageShell` for page framing), the brand rules in `DESIGN.md` and WCAG 2.2 AA (`PRODUCT.md`).

### 7.1 Public Place page `app/p/[slug]/page.tsx`

- **Gate:** env var `PLACES_PUBLIC_PAGES_ENABLED === 'true'` (add it to `.env.example`). When it is not set, call `notFound()`. This gate is separate from the per-user flag because anonymous visitors have no user id.
- **Server component** modeled on `app/e/[beaconId]/page.tsx`. Data comes from `loadPublicPlace(admin, slug)` wrapped in `unstable_cache` with a 60 s revalidate, tagged `place:${id}`.
- `generateMetadata`: title `"{name} · Click"`, description `"{Category} in {city}. See what's on and how it feels right now."`, Open Graph image = `photo_url` or the brand share image.
- **Layout:** hero photo; name; category · city; hours with open/closed; address + "Directions"; **Now** (same copy as §4.11: live / stale / none, the pattern and "N here now"); **Happening here** (upcoming official events → `/e/{id}`); **About**; a CTA card: "Check in and share the vibe with the Click app" + App Store button (reuse the existing store CTA, which respects `NEXT_PUBLIC_APP_LAUNCHED`).
- **`?t=` query** (QR opened in a browser): show a banner "You scanned {name}'s check-in code. Open in Click to check in." with an "Open in Click" button linking `click://p/{slug}?t={t}`. **Never echo `t` into any other link, metadata or analytics.**
- A signed-in web user sees the same page. No social sections on web in v1.
- `public/.well-known/apple-app-site-association`: add `"/p/*"` to the `paths` array. Add `/p/*` to Android `assetlinks.json` handling only if that file lists paths (it currently doesn't).
- `middleware.ts`: no change needed (only `/admin` and `/insights` are gated). Verify that `/p/x` renders signed out.
- Add `/p/` URLs to the sitemap if the repo has one (`grep -rn sitemap app`); otherwise skip.

### 7.2 Business area `app/business/places/`

- `app/business/places/page.tsx` (client component; requires sign-in, otherwise redirect to the existing login with `next`). It lists `GET /api/places/mine`. Empty state: "You don't manage a Place yet. Click Places is invite-only during the pilot. Contact us." (mailto from `APP_CONFIG`).
- `app/business/places/[id]/page.tsx`. Tabs:
  1. **Profile:** form for the fields `PATCH` allows (§5.7) + photo upload + Place Hub toggle. Read-only display of name, category, address, radius, status ("Verified · Listed" / "Verified · Not listed yet" / "Draft"). Show "Contact Click to change these" next to the read-only fields.
  2. **Stats:** `GET /api/places/{id}/stats?range=30d&detail=basic`. Tiles: Check-ins, Unique visitors, Repeat visitor rate, Pulses, Events hosted, New connections. Then a 7×24 heatmap of check-ins by local day/hour, an energy distribution bar and talkable/would-return splits. Every chart states its *n* (rule 3). Use the `dataviz` conventions already used by `/insights/event-engagement`.
  3. **QR poster:** `GET /api/places/{id}/anchors`. For each anchor, a printable card (CSS `@media print`) with the Place name, the QR code (`qrcode.react`, already a dependency), "Scan to check in on Click" and the URL in small text. A "Print" button calls `window.print()`.
- Link to it from the existing business signup success state and from the Insights shell header ("Manage Place").

### 7.3 Insights tab `app/insights/place/page.tsx`

- Add a `NAV` entry in `components/insights/BusinessInsightsShell.tsx`: `{ id: "place", href: "/insights/place", label: "Place", icon: Store /* lucide */, exact: false }`, placed first after Overview.
- The page reads `venue_id` from the query (`withVenue` already appends it) and calls `GET /api/places/{venue_id}/stats?range=90d&detail=full`.
- Charts: daily check-ins and unique visitors (line), average energy by day (line, 1–4 axis labeled Chill…Packed), Pulse by daypart (stacked bars), event vs regular check-ins (two tiles), median dwell (tile), the dow×hour heatmap. Every chart shows *n*.
- If the venue isn't a verified Place yet: an empty state "This venue isn't a Click Place yet." No error.
- Demo mode (`InsightsDemoContext`): add `mockPlaceStats` to `lib/insights/mockData.ts`.

### 7.4 Admin `app/(admin)/admin/places/page.tsx`

- Server component behind `requireAdminSession()`. Link it from the admin home page.
- **List:** name, slug, category, status, listed, hub, managers count, active anchors, check-ins in 30 d. Filter by status.
- **Create form** (§5.10 `createPlaceAction`): include a small map picker if an existing MapLibre component can be reused cheaply (`components/` search for `maplibre`); otherwise use latitude/longitude number inputs plus a link to open the coordinates in Apple Maps for checking.
- **Detail panel per place:** every action in §5.10.

---

## 8. Maintenance (PR W9)

1. Migration §3.4.
2. `lib/places/rollup.ts` (pure, §4.9) + `lib/server/places/rollupJob.ts`:
   - For each place with `verification_status = 'verified'`: for each local day in **[today − 3, yesterday]** (in `places.timezone`), load that day's insights-eligible check-ins, prior visitor ids (distinct `user_id` with `count_for_insights` and `checked_at` before the local day start), pulses, official event windows (`map_beacons` with `venue_id`, start/end overlapping the day) and encounters with `place_id`. Upsert `place_daily_stats`.
   - Re-computing the last 3 days makes it idempotent and tolerant of late rows.
3. Route `app/api/cron/places/route.ts` (GET, `authorizeCronRequest`): runs the rollup, then `admin.rpc('purge_place_presence', { p_check_in_days: 90, p_pulse_identity_days: 30, p_pulse_days: 400 })`. Response: `{ ok, rollup: { places, days }, purge }`.
4. `supabase/functions/cron-hourly-maintenance/index.ts`: add `const places = await runClickWebCron('/api/cron/places', 'places').catch((e) => ({ error: String(e) }));` next to `drops`, include it in the result object, and add a line to the header comment. Add the same call to `app/api/cron/hourly/route.ts` for manual runs.
5. The rollup runs hourly but only rewrites 3 days per Place. That's fine for pilot scale (≤ 50 Places). If Places grow past 500, change it to run only once per local day (out of scope).

---

## 9. Privacy and security checklist

Every PR author ticks the relevant items in the PR description.

- [ ] No route returns another user's id, name or avatar except: here-now names (only `share_with_connections` check-ins, only to connections), clicks-been-here names (only users with `place_visits_visible_to_connections`, only to connections, no dates), and you-met-here (the viewer's own connections).
- [ ] No manager-facing payload contains a user id, name, avatar or individual timestamp.
- [ ] No coordinates of any user are stored in `place_check_ins` / `place_pulses` or logged. Rejected check-ins store nothing.
- [ ] Ghost-mode users are excluded from here-now counts, here-now names and clicks-been-here. Blocked users are excluded from names.
- [ ] `count_for_insights` is snapshotted from `users.location_include_in_insights_enabled` on every check-in and Pulse write. Manager stats filter on it.
- [ ] `anchor_token` is never put into share links, metadata, logs, analytics or error messages.
- [ ] All new tables have RLS enabled. Clients have no direct INSERT/UPDATE/DELETE on Places tables.
- [ ] Every consumer route returns 404 with the flag off. The public page returns 404 without `PLACES_PUBLIC_PAGES_ENABLED`.
- [ ] No background location, region monitoring, notifications or scheduled tasks were added for Places on iOS.
- [ ] Retention: check-ins 90 d, Pulse identity 30 d, Pulses 400 d (`purge_place_presence`).
- [ ] Excluded categories (§1.3) cannot be created (the admin form has no such option; the enum has no such value).

---

## 10. Telemetry

Add these names to `PRODUCT_EVENTS` and `ALLOWED_PROPS` in `lib/server/telemetry/productEvents.ts`. They are server-emitted only (do not add them to `CLIENT_PRODUCT_EVENTS`):

| Event | Props | Emitted in |
|---|---|---|
| `place_viewed` | `source` (`map`, `nearby`, `event`, `link`, `qr`, `history`) | `GET /api/places/[id]`, when the client sends `?source=`; the iOS repository passes it |
| `place_check_in` | `proof` (`gps`, `qr`) | check-in POST success |
| `place_check_in_rejected` | `reason` | check-in POST reject |
| `place_pulse` | `has_energy` (bool), `has_followup` (bool) | Pulse POST / PATCH |
| `place_hub_opened` | — | hub messages GET for a hub with `place_id` (first page only) |
| `place_filter_used` | `filter` (the chip key) | client → existing telemetry route only if it accepts client events; otherwise skip in v1 |

**Success metrics for the pilot** (computed by an analyst from `product_events` + tables; no dashboard is needed in v1):

1. Weekly share of active users in the pilot area who view ≥ 1 Place on a day with **no** official event at that Place (`place_viewed` without an event that day).
2. Check-ins per Place per week, and the share that are QR vs GPS.
3. Pulse completion: `place_pulse` with energy ÷ `place_check_in`.
4. Hours with a live Pulse ÷ the Place's open hours.
5. Manager weekly active rate on `/business/places/[id]` or `/insights/place` (server access logs or a `place_stats_viewed` event if cheap).
6. New verified connections per 100 check-ins (`place_daily_stats`).

---

## 11. Test plan

| PR | Required tests |
|---|---|
| W1 | Apply all migrations to a local Supabase (`supabase db reset`). Selecting, inserting and updating through `venues` / `venue_managers` behaves as before for service role. Existing Jest suites pass after the mock renames. A manual smoke of `/insights` with a dev-allowlisted user. |
| W2 | Unit: `allMembersOptedIntoInsights` (all true → true; one false → false; missing row → false; DB error → false). Contract: business signup action inserts with forced columns (mock admin client). SQL check: `authenticated` can no longer insert into `places`. |
| W3 | SQL tests (in `__tests__/supabase/` if that folder has a SQL harness, else a documented manual script `scripts/sql/click_places_smoke.sql`): the trigger assigns `place_id` inside the radius and not outside; `backfill_place_encounters` re-attributes after a radius change; `places_nearby` excludes unlisted Places; the `place_check_ins_one_open` unique index; the `listed` constraint rejects incomplete rows. |
| W4 | Jest for every module in §4, including the shared filter fixture and DST/timezone cases for hours and patterns. |
| W5 | Route contract tests (copy `__tests__/app/api/hub.route.contract.test.ts` style with a mocked admin client): flag off → 404; nearby → shape; check-in GPS accept / out_of_bounds / low_accuracy / QR accept / QR invalid / QR + far GPS reject / refresh / supersede other Place; Pulse not_present / manager 403 / cooldown 429 / would-return-only after checkout / PATCH window; detail never includes other users' ids except in the allowed fields (assert via a deep-scan helper that walks the JSON for known non-friend ids). |
| W6 | Stats: no `user_id` key anywhere in the response (deep scan); `detail=full` without Insights → 402; opt-out rows excluded. PATCH: viewer role 403; invalid hours 400; hub toggle creates exactly one hub. |
| W7 | Event payload includes `place` only for listed Places; hub create inside a hub-enabled Place → 409. |
| W8 | Render test for `/p/[slug]` with the env flag off (404) and on (contains the name and no `t` echo except in the `click://` button). |
| W9 | `rollupPlaceDay` unit tests; cron route 401 without auth. |
| I1 | Decoding tests with full and minimal JSON (unknown category → `.other`); `AppRouterTests` for `/p/` forms; `NearbyDiscovery` decodes an old cache without `places`. |
| I2 | `PlaceFilterTests` (shared fixture); `NearbyMapTests`: an event with `venueID` of a listed Place is merged (no separate beacon item); the Places layer toggle hides Place items. |
| I3 | `PlaceDetailModel` tests with a stub repository: check-in success / out-of-bounds copy / QR confirm required before calling the API; Pulse submit replaces the summary; cooldown disables chips; manager hides the Pulse card. |
| I4 | `LocationPrivacy` row includes the new key; `BeaconDetail` shows the "At {place}" row only with the flag on. |

---

## 12. Rollout

1. Merge W1 → apply the migration → verify Insights and the Stripe webhook in production (no behavior change expected).
2. Merge W2 (deploy code, then the migration). Verify business signup still works end to end in Stripe test mode.
3. Merge W3–W9. The flag stays off and `PLACES_PUBLIC_PAGES_ENABLED` stays unset.
4. Admins create 10–20 pilot Places in one campus area: verify, set radius (cafés 50–75 m, bars 50–100 m, campus spaces up to 150 m), backfill encounters, create one check-in anchor each, enable hubs only where the partner wants one, add partner managers, then **list** them.
5. Turn on `click_places` for the internal team via `allow_user_ids`. Run the QA script below at two partner Places.
6. Raise `rollout_percent` for the pilot cohort and set `PLACES_PUBLIC_PAGES_ENABLED=true` on the Worker. Print and place QR posters.
7. Review the §10 metrics weekly for 6–8 weeks.

**QA script (on-site):**
- [ ] The Place pin appears with no filters. Toggling the Places layer hides it.
- [ ] An official event today shows as a badge on the Place pin, not as a separate event pin.
- [ ] "I'm here" from outside (≥ 300 m) → out-of-bounds copy with distance. From inside → checked in.
- [ ] Scanning the poster in the in-app scanner → confirm sheet → checked in. Scanning with the system camera opens the app (or the web page when the app isn't installed).
- [ ] Pulse: one tap → summary shows "1 report · just now". A second device's Pulse → "2 reports". Follow-up question works. Re-Pulse before 45 min → cooldown text.
- [ ] "Let my Clicks see I'm here" on device A → device B (connected) sees A's name in "here now". Off → B sees only the count.
- [ ] Ghost mode on device A → A is not counted on B.
- [ ] "Leave" → would-return question → answer recorded (`place_pulses.would_return`).
- [ ] The manager account cannot Pulse; it sees the manager note.
- [ ] `/p/{slug}` loads signed out. `?t=` shows the banner. Share links never contain `t`.
- [ ] `/business/places/{id}` stats update the next hour (rollup) and today's numbers live.

---

## 13. Non-goals for v1 (do not build)

Self-serve create/claim/verification flows (`place_claims`); tagged non-official events (`metadata.place_ref`); external POI ids and history adoption (`external_place_ref`); offers/perks (`venue_pop_up_hubs` UI); organizations and multi-location; large-venue zones; ticketing integration; App Clip check-in; web check-in or web Pulse; Android; push notifications of any kind for Places; Home feed cards other than §6.11; reviews, ratings, free text, photos from users; leaderboards or "regulars"; background or automatic check-in.

## 14. Next phases (outline only, not part of v1)

| Phase | Scope | Notes |
|---|---|---|
| v1.1 Claiming | `place_claims` table (`id, place_id, user_id, method, status, evidence, timestamps`), `/business/places/claim` flow with search, verification by domain email / phone call / admin review, duplicate merge tool | Replaces admin-only onboarding |
| v1.2 Tagged events | `map_beacons.metadata.place_ref` from the iOS place picker when a Place is matched; a separate "Also happening here" section; manager hide; not counted in stats | |
| v1.3 POI keys | Store `MKMapItem.identifier` / OSM id as `metadata.external_place_ref` on events and as `places.external_place_ref` (+ provider); on verification, adopt matching history | |
| v1.4 Recommendations | Place affinity term in `lib/events/connectionEventRecommendation.ts` | |
| v2 Perks | Manager-created time-boxed perks shown on the Place page to checked-in users | Builds on `venue_pop_up_hubs` |

## 15. Open questions (decide before v1.1, not blockers for v1)

1. Should Place Hub membership lapse after N days without a check-in?
2. Pricing for Click for Business once Places are free: per Place or per organization?
3. Should managers be able to change radius (with a backfill) once self-serve exists?
4. Does the Android/KMP client get Places in v1.1 or later? It must at least tolerate the new `place` field on event payloads (additive JSON, so it should).
5. Should the public web page show the live "here now" count to anonymous visitors? v1 says yes (aggregate only). Revisit if partners object.
