# Click Web

**The insights and web-calling companion dashboard.**

Click Web is the Next.js companion to the Click Kotlin Multiplatform (KMP) mobile app. It extends the product to the browser: authenticated users get a dashboard with real-time chat, optional WebRTC voice calling through LiveKit, business insights, and secure handling of auth redirects (including email verification).

---

## Feature overview

| Area | What it does |
|------|----------------|
| **Web-based VoIP** | In-browser calling via **LiveKit**: the app obtains a short-lived token from `/api/livekit/token`, joins a room with `livekit-client`, and coordinates with the same push / payload shapes the mobile app expects for incoming calls. |
| **Real-time chat** | Chat UI syncs with Supabase-backed data; API routes under `app/api/chat/` support messages, reactions, and related flows. |
| **User profile** | Profile viewing and management align with server routes under `app/api/users/` and shared UI components (for example `UserProfileModal`). |
| **Business insights & heatmaps** | Insights live under `app/insights/` (heatmap, live metrics, vibe stream, tribes, social activity, etc.), with supporting APIs such as `app/api/insights/`. |
| **Secure auth callbacks** | Email verification, PKCE, token-hash, and legacy hash flows are handled explicitly—see `app/auth/callback/page.tsx` and `app/api/auth/callback/route.ts`—so users see clear success or error states instead of silent failures. |

---

## Tech stack

- **[Next.js](https://nextjs.org/)** (App Router) — routing, layouts, API routes, and middleware.
- **[React](https://react.dev/)** — UI; client boundaries use `"use client"` only where needed (hooks, `window`, LiveKit, Framer Motion, etc.).
- **[Tailwind CSS](https://tailwindcss.com/)** (v4) — utility-first styling and responsive layout.
- **[Supabase](https://supabase.com/)** — Auth (`@supabase/ssr`, `@supabase/supabase-js`), Postgres-backed data, and **Edge Functions** invoked from the client where appropriate (e.g. push notification triggers). Server-side routes may use the service role where required.
- **LiveKit (web)** — **[livekit-client](https://docs.livekit.io/client-sdk-js/)** in the browser for rooms/tracks; **[livekit-server-sdk](https://docs.livekit.io/server-sdk-js/)** on the server to mint access tokens. Call surfaces are **custom React** built on the JS client (not the separate `@livekit/components` web-component package).

Other notable libraries include **Framer Motion**, **MapLibre GL**, **Recharts**, **SWR**, **Lucide**, and **Radix** (e.g. switch primitives).

---

## Project layout (high level)

- `app/` — App Router pages, layouts, and **Route Handlers** (`app/api/**`).
- `components/` — Feature UI (dashboard, chat, insights, modals, etc.).
- `lib/` — Supabase clients, auth helpers, config, and shared utilities.
- `middleware.ts` — Session refresh / auth cookie handling for Supabase.

---

## Local setup

### Prerequisites

- **Node.js** (LTS recommended) and **npm**.
- A **Supabase** project (URL + anon key; service role key for server routes that need elevated access).
- **LiveKit** project credentials if you use in-browser calling.

### Install

```bash
cd click-web
npm install
```

### Environment variables

Create **`.env.local`** in the `click-web` directory (never commit secrets). Examples below mirror what the codebase expects; see also `.env.local.example` and `.env.example`.

**Required (core app + Supabase client)**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |

**Server-only (recommended for production APIs)**

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Elevated access for select API routes (e.g. connections, QR, waitlist, user delete) when anon scope is insufficient |

**LiveKit (Web calling)**

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_WS_URL` or `LIVEKIT_URL` | WebSocket URL for the LiveKit server (see `app/api/livekit/token/route.ts`) |

**Optional**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_BASE_URL` | Canonical site URL (e.g. for links / QR); falls back to `VERCEL_URL` in some routes |
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

Web actions that wake mobile or mirror app contracts—especially **incoming call** push payloads—must stay aligned with the KMP app. Example: `DashboardView.tsx` documents parity with `CallPushNotifier.kt` for the `send-push-notification` Edge Function and `incoming_call` data shape. When changing call or notification flows, update **both** clients and any Edge Function schema.

---

## CORS and Edge Functions

The browser calls Supabase Edge Functions with `supabase.functions.invoke()`. **CORS applies.** Each invoked function must respond correctly to **OPTIONS** preflight requests and return appropriate `Access-Control-*` headers for your web origin, or invokes will fail from the dashboard.

---

## Deploy notes

Production deployments (e.g. Vercel) must define the same environment variables as `.env.local`, using the host’s secret store. Ensure Supabase **Auth → URL configuration** (site URL, redirect URLs) includes your deployed web origin so email links and OAuth return to the correct routes.

---

## License / monorepo

This package is part of the broader Click Platforms workspace. For mobile and shared product context, see the repository root documentation when present.
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/lightningbolts/click-web)