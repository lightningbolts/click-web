# Click Web

> **Anti-doomscrolling · Stop scrolling, start living.**  
> Click Web extends the same philosophy as the mobile app: **fewer infinite feeds, more real-world presence.** The dashboard and APIs exist to support verified connection, venue intelligence, and voice—not to recreate doomscroll loops in the browser.

**The insights, graph validation, and web-calling companion for Click.**

Click Web is the **Next.js** companion to the **Kotlin Multiplatform (KMP)** mobile app. It brings authenticated users a dashboard with **real-time chat**, optional **WebRTC** voice through **LiveKit**, **B2B analytics** for venues and promoters, and secure **auth redirects** (including email verification).

---

## Backend architecture (Supabase + Postgres)

- **Edge-first proximity clustering** — **Supabase Edge Functions** ingest **Tri-Factor** payloads (BLE fingerprints, ultrasonic chirp windows, progressive GPS samples), normalize them, and drive clique formation jobs without blocking the client on heavy graph work.  
- **O(1) graph validation for Group Cliques** — When the mobile app runs **Multi-Tap** (3+ simultaneous handshakes), the backend must confirm a **complete subgraph** (clique). We use **Postgres GIN indexes** on array-typed edge sets and **array containment** (`<@`) so “is this set of user IDs a fully connected clique under verified edges?” stays a **single indexed lookup**, not an exploratory graph crawl.  
- **Realtime + Row Level Security** — Chat, presence, and insights surfaces stay aligned with Supabase **Realtime** and RLS policies; service-role routes remain scoped to explicit admin/venue operations.

---

## Feature overview

| Area | What it does |
|------|----------------|
| **Web-based VoIP** | In-browser calling via **LiveKit**: short-lived token from `/api/livekit/token`, `livekit-client` rooms, payloads aligned with mobile push shapes. |
| **Real-time chat** | Chat UI syncs with Supabase-backed data; API routes under `app/api/chat/` support messages, reactions, and related flows. |
| **User profile** | Profile viewing and management via `app/api/users/` and shared UI (e.g. `UserProfileModal`). |
| **Business insights & heatmaps** | Insights under `app/insights/` (heatmap, live metrics, vibe stream, tribes, social activity) with APIs under `app/api/insights/`. |
| **Secure auth callbacks** | Email verification, PKCE, token-hash, and legacy hash flows—see `app/auth/callback/page.tsx` and `app/api/auth/callback/route.ts`. |

---

## Click for Business (B2B SaaS)

**Click for Business** is the monetization layer for **local venues, promoters, and event operators** who care about **who actually showed up together**, not just raw door counts.

### Micro-Community Analytics

Because Click **verifies physical group cliques** (not assumed friend graphs), venues see **verified social factions**—cohorts that arrived and connected as **real groups**. Example narrative: *“30% of attendees arrived as part of a verified Indie Rock micro-community.”* That is **foot traffic plus social topology**, grounded in handshake integrity.

### Vibe Radar & Availability Intents

- **24-hour availability intents** — Users broadcast short-lived intents (“Looking for coffee,” “Live music tonight”) visible in the product according to privacy rules.  
- **Vibe Radar** — Operators use a dashboard of **anonymized geographic hexbins** summarizing where those intents cluster, without exposing individual identities.  
- **Pop-Up Beacons** — Venues deploy **beacons on the Click map** to intercept intent-heavy zones and drive **predictive foot traffic** (right place, right window).

### Social Sticky Score

The dashboard surfaces a **Social Sticky Score**: composite metrics for **connection density** (how often verified cliques form on-site) and **connection survival** (whether those connections persist and re-engage after the event). It is designed to prove **real-world community ROI**—sticky social outcomes venues can cite beyond impressions or check-ins.

---

## Tech stack

- **[Next.js](https://nextjs.org/)** (App Router) — routing, layouts, API routes, middleware.  
- **[React](https://react.dev/)** — UI; `"use client"` only where needed (hooks, `window`, LiveKit, Framer Motion).  
- **[Tailwind CSS](https://tailwindcss.com/)** (v4) — utility-first styling.  
- **[Supabase](https://supabase.com/)** — Auth (`@supabase/ssr`, `@supabase/supabase-js`), Postgres, **Edge Functions** (push, proximity clustering, validation-adjacent workflows).  
- **LiveKit (web)** — **[livekit-client](https://docs.livekit.io/client-sdk-js/)** in the browser; **[livekit-server-sdk](https://docs.livekit.io/server-sdk-js/)** for access tokens (`app/api/livekit/token/route.ts`). Custom React on the JS client.

Other libraries include **Framer Motion**, **MapLibre GL**, **Recharts**, **SWR**, **Lucide**, and **Radix**.

---

## Project layout (high level)

- `app/` — App Router pages, layouts, and **Route Handlers** (`app/api/**`).  
- `components/` — Dashboard, chat, insights, modals.  
- `lib/` — Supabase clients, auth helpers, config.  
- `middleware.ts` — Session refresh / auth cookies.

---

## Local setup

### Prerequisites

- **Node.js** (LTS) and **npm**.  
- A **Supabase** project (URL + anon key; service role for elevated routes).  
- **LiveKit** credentials if you use in-browser calling.

### Install

```bash
cd click-web
npm install
```

### Environment variables

Create **`.env.local`** in the `click-web` directory (never commit secrets). See `.env.local.example` and `.env.example`.

**Required (core app + Supabase client)**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |

**Server-only (recommended for production APIs)**

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Elevated access for select API routes when anon scope is insufficient |

**LiveKit (Web calling)**

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_WS_URL` or `LIVEKIT_URL` | WebSocket URL for the LiveKit server |

**Optional**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_BASE_URL` | Canonical site URL; falls back to `VERCEL_URL` in some routes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth if enabled |
| `NEXT_PUBLIC_IOS_STORE_URL` / `NEXT_PUBLIC_ANDROID_STORE_URL` | Store links (`lib/config.ts`) |
| `NEXT_PUBLIC_APP_LAUNCHED` | Set to `true` when the app is publicly launched |

### Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Tests

```bash
npm test
```

---

## Cross-platform consistency

click-web is the **browser companion** to the KMP mobile app (`click/`). Mobile owns in-room discovery (Tri-Factor, sensors, native push); web owns the authenticated dashboard, B2B Click Insights, and HTTP BFF routes mobile calls over `CLICK_WEB_BASE_URL`.

### Can click-web deliver mobile user-facing features?

**Yes** for most post-connection experiences: connections inbox, map, timeline, E2EE chat, LiveKit calls, QR identity, availability intents, stats, and collaboration hooks (`components/DashboardView.tsx`).

**No** for hardware-native flows: BLE + ultrasonic + progressive GPS orchestration, Multi-Tap initiation in a physical room, sensor capture at handshake time, CallKit/PushKit/FCM wake, App Clip, and device calendar integration. Web can **display** Memory Capsule data captured on mobile but cannot produce the same sensor readings.

### Monorepo data flow

```
click (KMP) ──Tri-Factor/QR──► Supabase Edge + Postgres
     │                              ▲
     │ CLICK_WEB_BASE_URL           │ aggregates
     ▼                              │
click-web ──dashboard/chat/insights──┘
```

Mobile is the primary **data producer** for B2B insights (connections, encounters, availability intents with `include_in_business_insights`). Web is the **operator surface** for `/insights/*` and the **consumer dashboard** for browser users.

### Parity summary

| Category | Mobile | click-web |
|----------|--------|-----------|
| Tri-Factor / Multi-Tap initiation | Primary | Not achievable (hardware) |
| QR connect | Via web HTTP APIs | Full parity |
| Dashboard (table, map, timeline) | Yes | Full parity — `lib/dashboard/README.md` |
| E2EE chat | `MessageCrypto` | Full parity — `lib/chat/README.md` |
| Voice/video | LiveKit native | Web parity — `/api/livekit/token` |
| Availability intents | Yes | Partial (UI yes; match pushes mobile-first) |
| Memory Capsules | Capture + display | Display only |
| Community Hubs | Mobile-first UI | API-only — `lib/hub/README.md` |
| Home connection insights | `ReconnectHelper` | Gap (not on web dashboard) |
| B2B Click Insights | `widget-vibe` consumer | Web-only — `lib/insights/README.md` |

Detailed matrices live in colocated module READMEs: `lib/dashboard/README.md`, `lib/connections/README.md`, `lib/insights/README.md`. Mobile companion context: `click/README.md` § Monorepo note.

### Contract parity rules

Web actions that wake mobile or mirror app contracts—especially **incoming call** push payloads—must stay aligned with the KMP app. Example: `DashboardView.tsx` documents parity with `CallPushNotifier.kt` for the `send-push-notification` Edge Function and `incoming_call` data shape. E2EE wire format must match KMP `MessageCrypto` (`lib/chat/README.md`). When changing call, notification, or crypto flows, update **both** clients and any Edge Function schema. See `AI.md` §2 for field-name rules.

---

## CORS and Edge Functions

The browser calls Supabase Edge Functions with `supabase.functions.invoke()`. **CORS applies.** Each invoked function must respond correctly to **OPTIONS** preflight and return appropriate `Access-Control-*` headers for your web origin.

---

## Deploy notes

Production deployments (e.g. Vercel) must define the same environment variables as `.env.local`, using the host’s secret store. Ensure Supabase **Auth → URL configuration** (site URL, redirect URLs) includes your deployed web origin.

---

## License / monorepo

This package is part of the broader Click Platforms workspace. For the KMP client and shared product context, see **`click/README.md`** and any workspace root docs.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/lightningbolts/click-web)
