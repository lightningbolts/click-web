# Server utilities library (`lib/server`)

Trusted server-side primitives: **Supabase client factories** (anon cookie session vs service role), **gatekeepers** for chat and hub writes, **admin role**, and **business insights eligibility**. API routes import from here — never expose service keys to the client.

---

## Purpose

Centralize auth clients and authorization checks so `app/api/*` handlers stay thin and consistent with mobile security expectations.

---

## Architecture

```
Request
    │
    ├─ getSupabaseFromRouteRequest (supabaseRouteAuth.ts)
    │       → cookie or Bearer JWT → anon client + user
    │
    ├─ createSupabaseServiceRoleClient (supabaseServer.ts)
    │       → bypass RLS (webhooks, cron)
    │
    └─ createChatGatekeeperAdmin (chatGatekeeper.ts)
            → service role for membership lookups
```

### Supabase client factories

| Function | Key | Use |
|----------|-----|-----|
| `createSupabaseServerClient()` | Anon + cookies | Server Components / Actions |
| `createSupabaseServiceRoleClient()` | `SUPABASE_SERVICE_ROLE_KEY` | Webhooks, trusted jobs |
| `getSupabaseFromRouteRequest(request)` | Anon + Bearer/cookies | API route handlers |
| `createChatGatekeeperAdmin()` | Service role (fallback anon) | Chat/hub membership checks |
| `createAdminClient()` (`connectionWriteAuth.ts`) | Service role | Connection mutations |

**Rule:** User-facing mutations should verify JWT **then** use service role only where RLS would block necessary reads (chat participant check).

### `chatGatekeeper`

| Export | Behavior |
|--------|----------|
| `requireBearerUser(request)` | 401 if no valid JWT |
| `assertChatWritable(admin, userId, chatId)` | 403 if not group member / connection participant / inactive status |
| `assertMessageInWritableChat(admin, userId, messageId)` | Resolve message → chat → assertChatWritable |

Connection status normalization uses `lib/dashboard/connectionStatus.ts` (`isActiveChatListStatus`).

### `hubGatekeeper`

`assertHubGeofenceFromCoords(admin, hubId, lat, lng)` — haversine vs `hub_venues.radius_meters`, expired hub → 410.

### `adminRole`

`isAdminUser(user)` — reads `user.app_metadata.admin_role` (set via migration `20260612091000_admin_role_app_metadata.sql`).

Used by `proxy.ts` for `/admin/*` routes.

### `businessInsightsEligibility`

`userMayAccessBusinessInsights(supabase, user)`:

- `BUSINESS_INSIGHTS_DEV_EMAILS` env allowlist
- `users.role === 'verified_business'`
- `venue_managers` + `venues.subscription_status` in `active` | `trialing`

Used by middleware and insights API routes.

---

## E2EE / API constraints

- Gatekeepers authorize **who** can write rows; they never inspect or transform `messages.content` ciphertext.
- Service role clients must not be passed to browser code.
- `requireBearerUser` extracts bearer for downstream Edge Function invokes (e.g. push).

---

## Related files

| Path | Role |
|------|------|
| `lib/server/supabaseAuth.ts` | `getAuthenticatedSupabase` helper |
| `lib/server/connectionWriteAuth.ts` | Connection participant checks |
| `lib/server/admin/supabaseAdmin.ts` | Admin dashboard data |
| `lib/server/insightsVenueAugmentation.ts` | Venue API enrichment |
| `lib/server/terrainElevation.ts` | Open-Elevation for encounters |
| `lib/server/stripe.ts` | Stripe SDK |
| `proxy.ts` | Middleware using eligibility + admin |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Service role persists encounters after JWT validation.
- **Scan QR** — Admin client redeems tokens.
- **Group connect (Multi-Tap)** — Connection writes authorized per user.
- **Private encrypted chat** — chatGatekeeper enforces active connection.
- **Send photos/files/voice notes** — Writable chat check on POST.
- **Emoji reactions** — Message-in-chat authorization.
- **Typing & read receipts** — Chat membership.
- **Voice & video calls** — LiveKit token route uses auth helpers.
- **Memory Capsules** — Encounter routes use admin client.
- **48-hour gentle archive** — Status check in chatGatekeeper.
- **Connection map & timeline** — User-scoped reads via anon client + RLS.
- **Rate the vibe** — Participant auth.
- **QR identity card** — Authenticated GET.
- **Availability intents** — User JWT.
- **Match alerts** — Edge uses service role after JWT.
- **Community Hubs** — hubGatekeeper on messages/media.
- **Map beacons** — Auth on drop routes.
- **Global search** — Session-scoped.
- **Core connections** — connectionWriteAuth.
- **Collaboration sessions & disposable rolls** — Service role insert after bump.
- **Ghost mode** — Client flag; server stores handshake either way.
- **Block & report** — Safety routes.
- **Profile & interests** — User table RLS.
- **Onboarding** — Auth clients.
- **Google/email auth** — Session in cookies.
- **Push notifications** — Service role invokes push function.
- **Deep links & App Clip** — Session on landing.
- **Web dashboard** — Cookie session refresh in middleware.
- **Business insights** — businessInsightsEligibility gate.
- **Event reminders** — Cron service role.
- **Achievements & stats** — User-scoped queries.
