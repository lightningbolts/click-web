# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary audiences, equally first-class:

- **People who met in the room.** Someone who already formed a verified in-person connection (or is about to) and is continuing that relationship in the browser: dashboard, chat, map, events, QR identity, and optional LiveKit calls. Anonymous visitors on `/` and public `/events` are how many of them arrive.
- **Venues, promoters, and event operators.** Local operators who need to know **who actually showed up together**, not just door counts. They work in Click for Business (`/insights/*`): verified factions, heatmaps, tribes, vibe radar, events, and engagement.

Mobile remains the hardware-native handshake client. click-web does not replace it for people standing in a room.

## Product Purpose

Click exists so brief, real-world encounters become lasting connection — **stop scrolling, start living.** click-web is the browser companion to that product: authenticated continuation of verified relationships, public event surfaces, and the operator analytics layer that only Click can produce because the graph is physically verified.

Success is not time-on-site or feed engagement. Success is that a person can continue a real connection without a doomscroll loop, and that an operator can cite **verified social topology** (who arrived as a real group, whether those connections stuck) rather than impressions.

## Positioning

Click is a **digital handshake**, not a social network. Phones corroborate that they shared the same physical context (Tri-Factor: BLE, ultrasonic chirps, progressive GPS). Three or more people connecting at once become a **verified group clique** — a complete subgraph, not an assumed friend list.

A neighboring check-in, event, or social app cannot truthfully copy that: they do not have mathematically verified co-location or O(1) clique validation. Click for Business sells that difference as **foot traffic plus social topology**.

click-web’s distinct job in the system is the operator surface (web-only) plus the consumer dashboard and HTTP BFF that mobile calls. It cannot originate Tri-Factor or Multi-Tap; claiming otherwise would be a product lie.

## Operating Context

- Production origin: `https://joinclick.co`. Local: `npm run dev` on port 3000.
- Companion to the Kotlin Multiplatform app in the sibling `click/` repo. Shared backend: Supabase Auth, Postgres, Realtime, Edge Functions. Web calling: LiveKit.
- Consumer rituals: handshake or QR in the room → 48-hour window to act before auto-archive (hygiene, not deletion) → chat / map / events / optional call. Memory Capsules are captured on mobile; web can display them, not produce the sensor readings.
- Operator rituals: open Insights for a venue, read anonymized hexbins and verified factions, deploy map beacons, run events, export.
- Public events (`/events`, `/e/{id}`) allow guest RSVP without an account.
- Launch posture: **joinclick.co is live** as the browser companion (dashboard, events, chat, map, QR). The **iOS/Android handshake app is not public yet**; consumer acquisition on `/` is waitlist-led for that app (`Join the Waitlist`). `NEXT_PUBLIC_APP_LAUNCHED` gates store/connect surfaces for the mobile app, not the website.

## Capabilities and Constraints

Confirmed on web:

- Authenticated dashboard (connections, map, timeline, E2EE chat, QR, availability intents, stats).
- In-browser LiveKit voice when credentials are present.
- Public events directory and microsites; create events from the dashboard.
- Click for Business: heatmap, live metrics, vibe stream, tribes, social activity, vibe radar, event engagement, Social Sticky Score.
- Auth callbacks (email verification, PKCE, recovery) must show success/error, not blind redirects.
- Card identity for beacons/pins is a cross-platform contract (`lib/ui/generateCardVisual.ts` ↔ mobile `CardVisual.kt`).

Hard limits:

- No BLE / ultrasonic / progressive GPS orchestration, no Multi-Tap initiation, no CallKit/PushKit/FCM wake, no App Clip, no device calendar, no Memory Capsule capture.
- Insights must not expose individual identities in vibe-radar / hexbin views.
- Availability-intent match pushes remain mobile-first.
- Community Hubs are API-only on web.
- Contracts with mobile (push payloads, E2EE wire format, incoming-call shape) are shared; web must not “simplify” field names.

Open: whether the **mobile** app is publicly launched (`NEXT_PUBLIC_APP_LAUNCHED`). The website companion is already in production. LiveKit and Stripe are optional dependencies, not product promises when unset.

## Brand Commitments

- Name: **Click**. Operator product: **Click for Business**. Origin: **joinclick.co**.
- Tagline: **Stop scrolling. Start living.**
- Positioning line in market: **Click: from handshake to friendship.**
- Trust claims already in market: no ads, no feed, built at UW. Do not add competing slogans.
- Marks live in `public/brand/` (`logo.svg`, `logo-light.svg`, `logo-mark.svg`, `logo-icon.svg`) and `components/ClickLogo.tsx`.
- Voice: people-first, presence over consumption, honest about what is verified vs assumed. No hype metrics.

## Evidence on Hand

Real, in-repo:

- Shipped product copy and playground on `/` (`components/landing/LandingPage.tsx`, `docs/ui-ux/02-landing.md`).
- Parity and architecture in `README.md`, `AI.md`, and colocated module READMEs (`lib/dashboard`, `lib/chat`, `lib/insights`, `lib/connections`).
- Brand SVG marks under `public/brand/`.
- Cross-platform card-visual generator and tests.

Must not be fabricated: testimonials, named customers, attendance percentages, sticky-score benchmarks, press, pricing, or “30% arrived as Indie Rock” examples presented as live data. The README’s faction narrative is an **example of the kind of claim the data can support**, not evidence on hand.

## Product Principles

1. **Presence over the feed.** Do not recreate infinite scroll, ads, or engagement loops in the browser. The web companion should make it easier to live the connection, not to linger in the product.
2. **Verified or silent.** Show clique, encounter, and operator claims only when the handshake graph supports them. Never imply a social graph Click did not verify.
3. **Two-sided without a side quest.** Consumer continuation and operator proof are both primary. Designing one by starving the other is a product failure.
4. **Hardware stays on the phone.** Web may display and continue; it may not cosplay the Tri-Factor handshake.
5. **Archive is hygiene.** The 48-hour sweep keeps the active surface calm. It is not a countdown punishment and must not be designed as one.

## Accessibility & Inclusion

WCAG 2.2 AA is the product standard on click-web surfaces (landing, dashboard, events, insights, auth). Generated card visuals already search for 4.5:1 contrast; that bar applies everywhere, including names, keyboard access, focus, and touch/click targets.
