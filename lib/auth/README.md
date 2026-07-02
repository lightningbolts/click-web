# Auth library (`lib/auth` + `lib/AuthContext.tsx`)

Web authentication: **PKCE OAuth** (Google/Apple), email magic links, session cookies via `@supabase/ssr`, React context for dashboard consumers, and **middleware route protection** for admin and business insights.

---

## Purpose

| Piece | Location | Role |
|-------|----------|------|
| `oauth.ts` | `lib/auth/` | `startOAuth`, scopes, redirect URL builder |
| `AuthContext.tsx` | `lib/` | `AuthProvider`, `useAuth` hook |
| `proxy.ts` | project root | Next.js middleware — session refresh, `/admin`, `/insights` gates |
| `app/api/auth/*` | routes | Callback, signout, session exchange |

Mobile uses native `signInWith(IDToken)`; web uses hosted redirect flow exclusively.

---

## Architecture

```
Browser
    │ signInWithOAuth (PKCE)
    ▼
Google / Apple
    │ redirect
    ▼
/api/auth/callback  →  code exchange  →  HTTP-only cookies
    │
    ▼
AuthProvider (client)
    │ getSession / onAuthStateChange
    │ Realtime presence on room:presence
    ▼
Dashboard / Chat / Insights pages
```

### `AuthContext.tsx`

Exports:

- `AuthProvider` — wraps app in `app/layout.tsx`
- `useAuth()` — `{ user, loading, onlineUserIds, profileImageUrl, setProfileImageUrl, signOut, refreshUser }`

Behaviors:

- Loads `public.users.image` for instant avatar
- Subscribes to `supabase.auth.onAuthStateChange` — handles `PASSWORD_RECOVERY` → `/reset-password`
- **Presence** — channel `room:presence`, heartbeat every 25s for online indicators in chat/dashboard
- `signOut` — POST `/api/auth/signout` then `supabase.auth.signOut()`

### PKCE flow (`oauth.ts`)

```typescript
startOAuth(supabase, { provider, origin, next })
  → signInWithOAuth({ redirectTo: `${origin}/api/auth/callback?next=…`, scopes })
```

| Provider | Scopes |
|----------|--------|
| Google | `openid profile email` |
| Apple | `name email` |

`buildRedirectUrl(origin, next)` — default `next=/dashboard`.

### Middleware route protection (`proxy.ts`)

| Route pattern | Rule |
|---------------|------|
| `/api/*` | **No** `getUser()` in middleware (perf); each route authenticates itself |
| `/admin`, `/admin/*` | Requires `isAdminUser(user)` (`app_metadata.admin_role`) |
| `/insights`, `/insights/*` | Requires `userMayAccessBusinessInsights(supabase, user)` else redirect `/business/signup` |
| Other pages | Refreshes session cookies via `createServerClient` |

Connections API mutations rate-limited 10/min/IP in same middleware.

### Insights access control

`userMayAccessBusinessInsights` (`lib/server/businessInsightsEligibility.ts`):

- Dev email allowlist env var
- `verified_business` role
- Venue manager with Stripe `active` / `trialing` subscription

Used by middleware **and** should be re-checked in insights API routes.

---

## E2EE / API constraints

- JWT access token is sent as `Authorization: Bearer` to API routes; E2EE keys are derived client-side after auth — server never receives encryption keys.
- Service role routes (`chatGatekeeper` admin client) bypass RLS but still require user JWT on the request for user-scoped operations.
- Admin role is read from `user.app_metadata.admin_role` — not from client-writable `user_metadata`.

---

## Related files

| Path | Role |
|------|------|
| `app/api/auth/callback/route.ts` | PKCE code exchange |
| `app/api/auth/signout/route.ts` | Cookie clear |
| `app/auth/callback/page.tsx` | Client callback fallback |
| `lib/server/supabaseRouteAuth.ts` | `getSupabaseFromRouteRequest` for API handlers |
| `lib/server/supabaseServer.ts` | Server Components client |
| `lib/supabase.ts` | Browser `getSupabaseClient` |
| `lib/server/adminRole.ts` | Admin check |
| `app/api/user/insights-access/route.ts` | Client-side insights gate probe |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Requires signed-in user.
- **Scan QR** — Auth before generate/redeem.
- **Group connect (Multi-Tap)** — Auth + JWT to proximity API.
- **Private encrypted chat** — Session unlocks Realtime subscriptions.
- **Send photos/files/voice notes** — Authenticated upload/sign routes.
- **Emoji reactions** — Auth on reactions API.
- **Typing & read receipts** — Presence + read routes.
- **Voice & video calls** — LiveKit token requires user.
- **Memory Capsules** — Tied to authenticated encounters.
- **48-hour gentle archive** — Per-user connection lists.
- **Connection map & timeline** — User-scoped data.
- **Rate the vibe** — Auth on vibe POST.
- **QR identity card** — GET `/api/qr` when logged in.
- **Availability intents** — User intents API.
- **Match alerts** — Push to authenticated user.
- **Community Hubs** — Bearer on hub routes.
- **Map beacons** — Auth for drop/create.
- **Global search** — Dashboard session.
- **Core connections** — Per-user pins.
- **Collaboration sessions & disposable rolls** — Participant IDs from session.
- **Ghost mode** — Optional privacy on proximity payload (client).
- **Block & report** — Auth safety routes.
- **Profile & interests** — Profile modal + settings.
- **Onboarding** — OAuth/email signup flows.
- **Google/email auth** — **Core module** — PKCE Google/Apple + email.
- **Push notifications** — Push token registration `/api/user/push-tokens`.
- **Deep links & App Clip** — Universal links land → auth if needed.
- **Web dashboard** — `AuthProvider` gates main app.
- **Business insights** — Separate gated area for venue managers.
- **Event reminders** — Push to creator account.
- **Achievements & stats** — Per-user metrics.
