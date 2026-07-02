# Business Insights library (`lib/insights`)

B2B analytics helpers for venue operators: **Vibe Radar** hexbins, **widget vibe** payloads, encounter clustering for heatmaps, and types for **Social Sticky Score** / advanced ROI metrics. Billing gates live in `lib/server/businessInsightsEligibility.ts` + Stripe webhooks.

---

## Purpose

| Module | Role |
|--------|------|
| `vibeRadar.ts` | Parse `insights_vibe_radar_data` RPC — anonymized intent hexbins near a venue |
| `widgetVibePayload.ts` | Lightweight “how busy is Click” widget for embeds |
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
    ├─ app/api/insights/[venueId] → venue metrics + augmentation
    ├─ app/api/insights/widget-vibe → widgetVibePayload
    └─ app/api/webhooks/stripe    → subscription_status on venues
```

### Vibe Radar hexbins

`parseVibeRadarRpcPayload(raw)` normalizes:

- `clusters[]` — `{ hex_id, category, count, approx_lat, approx_lng }`
- `categoryTotals[]` — intent category rollups
- `venueCenter`, `radiusMeters` (default ~160.934 m / 0.1 mi)
- `trendingVibes[]` — beacon type density (managers only) via `insights_vibe_radar_beacon_density`

**Privacy:** No user IDs in radar payloads — only anonymized `anonymized_cell_id` / hex aggregates from `availability_intents`.

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
| `app/api/insights/intents/route.ts` | Intent analytics |
| `components/insights/VibeRadarMap.tsx` | Hexbin map UI |
| `components/insights/BusinessInsightsShell.tsx` | Shell layout |
| `app/insights/heatmap/page.tsx` | Heatmap page |

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
- **Business insights** — **Primary module**: heatmaps, vibe stream, tribes, live metrics, Stripe-gated.
- **Event reminders** — Event beacon analytics.
- **Achievements & stats** — Consumer achievements; B2B uses ROI metrics instead.
