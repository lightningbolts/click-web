# Business Insights library (`lib/insights`)

B2B analytics helpers for venue operators: **Vibe Radar** hexbins, **widget vibe** payloads, encounter clustering for heatmaps, and types for **Social Sticky Score** / advanced ROI metrics. Billing gates live in `lib/server/businessInsightsEligibility.ts` + Stripe webhooks.

---

## Purpose

| Module | Role |
|--------|------|
| `vibeRadar.ts` | Parse `insights_vibe_radar_data` RPC — anonymized intent hexbins near a venue |
| `widgetVibePayload.ts` | Lightweight “how busy is Click” widget for embeds |
| `analytics.ts` | Handshake vs Prior Connection split — never mix into one vanity total |
| `connectionEncounterClustering.ts` | Client-side centroid clustering of raw encounter GPS for maps |
| `advancedMetrics.ts` | Types for VLC, AMS, ACR, CPR, WRI, PSV RPCs |
| `microCommunities.ts` | Verified group faction analytics |
| `fetchInsightsApi.ts` | Authenticated fetch wrapper for insights pages |

---

## Architecture

```
Venue manager (Stripe active/trialing)
    │
    ▼
proxy.ts → userMayAccessBusinessInsights
    │
    ├─ /insights/heatmap          → connectionEncounterClustering
    ├─ /insights/vibe-stream      → Vibe Radar live
    ├─ /insights/events            → create/list event beacons (not BeaconDeployModal)
    ├─ /insights/event-engagement → funnel / arrival / rejects / dwell
    ├─ GET /api/insights/[venueId]/network-health-trend → recap-summary per completed event
    ├─ app/api/insights/[venueId] → venue metrics + augmentation
    ├─ app/api/insights/[venueId]/event-engagement → aggregates from event_engagement_events
    ├─ app/api/insights/widget-vibe → widgetVibePayload
    └─ app/api/webhooks/stripe    → subscription_status on venues
```

### Vibe Radar hexbins

`parseVibeRadarRpcPayload(raw)` normalizes:

- `clusters[]` — `{ hex_id, category, count, approx_lat, approx_lng }`
- `categoryTotals[]` — intent category rollups
- `venueCenter`, `radiusMeters` (default ~160.934 m / 0.1 mi)
- `trendingVibes[]` — beacon type density (managers only) via `insights_vibe_radar_beacon_density`

**Privacy:** No user IDs in radar payloads — only anonymized `anonymized_cell_id` / hex aggregates from `availability_intents`. Venue connection counts query `source = 'handshake'` (see `lib/insights/analytics.ts`); prior connections are never mixed into handshake vanity totals.

### Business insights billing / Stripe

Access control (`businessInsightsEligibility.ts`):

1. `BUSINESS_INSIGHTS_DEV_EMAILS` allowlist (non-prod)
2. `users.role === 'verified_business'`
3. `venue_managers` join where `venues.subscription_status` is `active` or `trialing`

Webhook: `app/api/webhooks/stripe/route.ts` updates venue subscription + idempotency table (`20260612092000_stripe_webhook_idempotency.sql`).

### `widgetVibePayload.ts`

`buildWidgetVibePayload(connectionRows)`:

- Counts connections in **active chat list** statuses
- `status_text` — human copy (“Quiet”, “energy is building”)
- `density_hex_color` — green → yellow → orange → purple by count
- Used by `/api/insights/widget-vibe` for embeddable widgets

### Venue metrics & Social Sticky Score

Advanced RPCs (types in `advancedMetrics.ts`):

| Metric | Meaning |
|--------|---------|
| **VLC** (Venue Loyalty Coefficient) | Repeat connection density at venue |
| **AMS** (Anchor Magnetism Score) | NFC anchor retention |
| **ACR** (Acoustic Conversion) | Connection rate by noise bucket |
| **CPR** (Cross-Pollination Rate) | Cross-group introductions |
| **WRI** (Weather Resilience Index) | Connections on adverse vs fair weather days |
| **PSV** (Peak Social Velocity) | Hour-of-day connection velocity |
| **Group clustering rate** | Verified clique formation rate |

**Social Sticky Score** (product narrative in root README): composite of **connection density** (verified cliques on-site) and **connection survival** (post-event re-engagement). Surfaced on insights dashboards alongside peer percentiles.

`lib/server/insightsVenueAugmentation.ts` merges encounter clusters into venue map API responses.

---

## E2EE / API constraints

- Insights APIs never return message content or decrypt chat.
- Encounter coordinates may be centroid-snapped **client-side** for display only; raw rows stay lossless in DB.
- All `/insights/*` pages and `/api/insights/*` routes require `userMayAccessBusinessInsights` (middleware + per-route checks).

---

## Related files

| Path | Role |
|------|------|
| `lib/server/businessInsightsEligibility.ts` | Access gate |
| `lib/server/stripe.ts`, `stripeVenueStatus.ts` | Stripe helpers |
| `app/api/insights/[venueId]/route.ts` | Venue dashboard data |
| `app/api/insights/[venueId]/advanced-metrics/route.ts` | ROI RPCs |
| `app/api/insights/[venueId]/event-engagement/route.ts` | Event funnel / arrival / rejects |
| `app/api/insights/intents/route.ts` | Intent analytics |
| `lib/server/eventEngagement.ts` | Telemetry insert + venue scale helpers |
| `components/insights/VibeRadarMap.tsx` | Hexbin map UI |
| `components/insights/BusinessInsightsShell.tsx` | Shell layout (Events + Event engagement nav) |
| `app/insights/events/page.tsx` | Venue event create/list + network-health trend |
| `app/insights/heatmap/page.tsx` | Heatmap page |
| `app/insights/event-engagement/page.tsx` | Event engagement charts |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Source data for verified encounter clusters.
- **Scan QR** — Same encounter pipeline.
- **Group connect (Multi-Tap)** — Powers micro-community analytics.
- **Private encrypted chat** — Not exposed to operators.
- **Send photos/files/voice notes** — Not in insights.
- **Emoji reactions** — Not in insights.
- **Typing & read receipts** — Not in insights.
- **Voice & video calls** — Not in insights.
- **Memory Capsules** — Sensor tags inform vibe classification (enrichment module).
- **48-hour gentle archive** — Affects active connection counts in widget vibe.
- **Connection map & timeline** — Consumer map; B2B sees aggregated heatmap.
- **Rate the vibe** — Feeds vibe capture enrichment.
- **QR identity card** — Consumer feature.
- **Availability intents** — **Vibe Radar** input (24h anonymized hexbins).
- **Match alerts** — Consumer push.
- **Community Hubs** — Venue-adjacent social energy.
- **Map beacons** — Trending vibe density on radar.
- **Global search** — Consumer dashboard.
- **Core connections** — Widget counts active kept connections.
- **Collaboration sessions & disposable rolls** — Re-engagement signals for sticky score.
- **Ghost mode** — Not tracked in B2B.
- **Block & report** — Safety.
- **Profile & interests** — Intent categories in radar.
- **Onboarding** — Consumer.
- **Google/email auth** — Manager login.
- **Push notifications** — Consumer.
- **Deep links & App Clip** — Consumer.
- **Web dashboard** — Consumer connections UI.
- **Business insights** — **Primary module**: heatmaps, vibe stream, tribes, live metrics, **event engagement**, Stripe-gated.
- **Event reminders** — Event beacon analytics.
- **Event engagement telemetry** — `event_engagement_events` + `/api/insights/[venueId]/event-engagement` + `/insights/event-engagement` charts (website only).

---

## Event engagement (bookmarks, RSVP, check-ins, impressions)

Raw capture (service-role inserts into `event_engagement_events` via `lib/server/eventEngagement.ts`). Current-state tables: `event_bookmarks`, `event_check_ins`. Migration: `supabase/migrations/20260718140000_event_engagement.sql`.

| `event_type` | Meaning |
|--------------|---------|
| `event_view` | Impression (detail open; 2s debounce) |
| `bookmark_set` / `bookmark_unset` | Saved interest |
| `rsvp_set` / `rsvp_unset` | Attendance intent |
| `check_in` / `check_out` | On-site presence |
| `check_in_rejected` | Friction (`no_location`, `out_of_bounds`, `not_live`, …) |
| `share` | Optional / future |

### KPI catalog (operator charts)

| KPI | Derivation |
|-----|------------|
| Impressions / unique viewers | Count / distinct `user_id` on `event_view` |
| Interest rate | `bookmark_set` ÷ impressions |
| RSVP conversion | `rsvp_set` ÷ impressions |
| No-show vs walk-up | RSVP without `check_in` vs `check_in` with `had_rsvp=false` |
| Arrival curve | Histogram of `minutes_after_start` on `check_in` |
| Dwell | p50 / p90 from `checked_out_at − checked_in_at` |
| Geofence / permission friction | `check_in_rejected` by `reject_reason` |

**Website charts:** `/insights/event-engagement?venue_id=…` — funnel bars, arrival histogram, reject breakdown, dwell p50/p90. Aggregates only (no user ids / raw coords). Demo mocks: `mockEventEngagement` in `mockData.ts`. Nav: `BusinessInsightsShell`.

**Mobile:** captures telemetry; does **not** show operator charts. Handoff: `click/docs/handoff/event-engagement-api.md`.

---

## Real-world testing

Layered playbook for validating the Click Insights dashboard and `/api/insights/*` routes against real or synthetic data.

### Testing layers

| Layer | What it validates | How |
|-------|-------------------|-----|
| **0 — Unit** | Encounter clustering + engagement helpers | `npm test` → `connectionEncounterClustering.test.ts`, `eventEngagement.test.ts`, `event-engagement.route.contract.test.ts` |
| **1 — UI smoke** | Dashboard renders without DB | Open `/insights?demo=1` or toggle demo in shell; uses `lib/insights/mockData.ts` via `InsightsDemoContext` (`click_insights_demo_mode` in localStorage). Also `/insights/event-engagement` in demo mode. |
| **2 — Dev access** | Auth gate without Stripe | Set `BUSINESS_INSIGHTS_DEV_EMAILS=you@example.com` in `.env.local`; or set `users.role = 'verified_business'` in Supabase |
| **3 — Billing path** | Stripe → venue subscription | `/business/signup` → Stripe test checkout → webhook `app/api/webhooks/stripe/route.ts` sets `venues.subscription_status` |
| **4 — Synthetic connections** | Encounter pipeline without hardware | `POST` proximity bind with `simulator_mock: true`, `my_token: "1234"`, `heard_tokens: ["5678"]` — see `lib/server/proximity/bindProximityHandshake.ts` |
| **5 — Real pilot** | End-to-end venue analytics | Mobile handshakes at pilot coordinates with insights opt-in; see checklist below |
| **6 — API contract** | JWT + RBAC + no PII | `curl` with manager bearer token against `/api/insights/[venueId]` etc. |
| **7 — Admin ops** | Tier overrides | `/admin#click-insights` |

### Environment variables (insights)

| Variable | Purpose |
|----------|---------|
| `BUSINESS_INSIGHTS_DEV_EMAILS` | Comma-separated allowlist bypassing Stripe in non-prod |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Checkout + subscription webhooks |
| `NEXT_PUBLIC_SUPABASE_URL` / keys | Auth + RPC calls |

### Venue pilot seed (SQL template)

Run in Supabase SQL editor after migrations. Replace UUIDs and coordinates with your pilot site.

```sql
-- 1. Venue
INSERT INTO venues (id, name, location, latitude, longitude, subscription_status)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Pilot Cafe',
  '123 Main St',
  37.7749,
  -122.4194,
  'active'
) ON CONFLICT (id) DO UPDATE SET subscription_status = 'active';

-- 2. Manager (use auth.users id for your test account)
INSERT INTO venue_managers (venue_id, user_id, role)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '<YOUR_AUTH_USER_UUID>',
  'owner'
) ON CONFLICT DO NOTHING;

-- 3. NFC anchor (optional — AMS / heatmap zones)
INSERT INTO nfc_anchors (venue_id, label, latitude, longitude)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Front door',
  37.7749,
  -122.4194
);
```

### Pilot checklist (real world)

1. Apply migrations: `scripts/apply-supabase-migrations.sh` (or `supabase db push`).
2. Seed venue + `venue_managers` + optional `nfc_anchors` (SQL above).
3. Grant access: dev email allowlist **or** complete Stripe test checkout at `/business/signup`.
4. On pilot phones: enable **Include in business insights** in location settings.
5. Create **5+ connections** at the venue (Tri-Factor or QR); submit post-connection vibe ratings.
6. Broadcast **availability intents** within ~0.1 mi of venue for Vibe Radar.
7. Sign in as manager → verify `/insights`, heatmap, tribes, vibe-radar, live-metrics, advanced-metrics, **event-engagement**.
8. From mobile: open event detail (impression), bookmark, RSVP, check-in (or rejected far away) → confirm aggregates move on `/insights/event-engagement`.
9. `curl` APIs with manager JWT; confirm responses contain **no** user IDs, emails, or message content.

### API smoke examples

```bash
# Access check
curl -s -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/user/insights-access"

# Venue dashboard (replace VENUE_ID)
curl -s -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/insights/$VENUE_ID"

# Advanced ROI metrics
curl -s -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/insights/$VENUE_ID/advanced-metrics"

# Vibe Radar intents
curl -s -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/insights/intents?venueId=$VENUE_ID"

# Event engagement aggregates
curl -s -H "Authorization: Bearer $JWT" \
  "$BASE_URL/api/insights/$VENUE_ID/event-engagement"
```

### Stripe webhook (local)

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Complete test checkout at /business/signup; confirm venues.subscription_status updates
```

### Mobile widget-vibe (consumer)

The KMP app calls `GET /api/insights/widget-vibe` with JWT (`ApiClient.kt`) for the home-screen density widget—not the B2B dashboard. Point `CLICK_WEB_BASE_URL` at your dev/preview click-web instance when testing.

### Known testing gaps

- Most `/api/insights/*` routes still lack contract tests (event-engagement beacon routes are covered under `__tests__/app/api/beacons/`).
- No checked-in venue seed script (SQL template above; P0 roadmap).

---

## Roadmap

Prioritized backlog derived from current code gaps. Acceptance criteria are indicative—implement when scheduled.

### P0 — Parity and testability

| # | Feature | Code touchpoints | Acceptance |
|---|---------|------------------|------------|
| 1 | Consumer connection insights on web dashboard | `ReconnectHelper` (mobile) → port or API; `DashboardView` | Same stats as mobile home insights panel |
| 2 | Community Hubs web UI | `lib/hub/`, `DashboardView` nav | Create/join/nearby hubs from browser |
| 3 | Insights API contract tests | `__tests__/app/api/insights/` | 401/403/200 shapes for main routes |
| 4 | Venue pilot seed script | `scripts/seed-pilot-venue.sql` | One-command venue + manager + anchor |
| 5 | `npm run test:insights-smoke` | `package.json`, small script | JWT + venueId health check |

### P1 — Click Insights product depth

| # | Feature | Code touchpoints |
|---|---------|------------------|
| 6 | Friction analytics page | `system_friction_logs`, `lib/cron/README.md` |
| 7 | Venue report export (CSV/PDF) | insights pages + download route |
| 8 | Multi-venue portfolio view | `venue_managers` multi-row UX |
| 9 | NFC anchor self-service editor | `nfc_anchors`, map UI in insights |
| 10 | Live metrics realtime | `live-metrics/page.tsx`, Supabase Realtime or SSE |
| 11 | Min-threshold UX | `[venueId]/route.ts` min 5 connections — empty states in UI |
| 12 | Beacon analytics loop | `VenueBroadcastingModule` ↔ vibe-radar density RPCs |

### P2 — Growth

| # | Feature |
|---|---------|
| 13 | Embeddable widget SDK (`widget-vibe` iframe/JS snippet) |
| 14 | Scheduled operator email digests |
| 15 | Webhook integrations for POS/ticketing partners |
| 16 | Web Push for dashboard when tab backgrounded |
| 17 | Calendar-aware availability on web |
| 18 | QR-only web connect for laptop users at events |

**Out of scope:** Web Tri-Factor via Web Bluetooth/Web Audio (poor iOS support; conflicts with verified-handshake integrity).

Cross-platform parity for consumer features: `lib/dashboard/README.md`. Mobile data producer role: `click/README.md` § Monorepo note.
