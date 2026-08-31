# Supabase Edge Functions (`click-web/supabase/functions`)

> **Note:** This `supabase/` tree is the **source of truth** for shared Postgres migrations and `bind-proximity-connection`. The mobile (`click`) repo mirrors a subset — keep them in sync via `click/scripts/sync-supabase-from-click-web.sh`. Mobile-only Edge Functions (`send-push-notification`, etc.) live only in `click`.

Serverless Deno workers deployed to Supabase. They handle proximity binding, scheduled maintenance, beacon discovery, and availability matching. Mobile and web clients invoke user-facing functions with a **Bearer JWT**; cron jobs use **CRON_SECRET** or the service role key.

> **Note:** `POST /api/connections/proximity` (Next.js) is the **newer async handshake path** with `pending_handshakes` and HTTP 202 polling. The `bind-proximity-connection` Edge Function remains deployed for legacy clients and documents the canonical matching semantics both paths share.

---

## Purpose

| Function | Role |
|----------|------|
| `bind-proximity-connection` | Tri-Factor proximity bind: ingest BLE/audio tokens + GPS, BFS clique matching, connection + encounter persistence |
| `cron-hourly-maintenance` | Hourly pg_cron job: disposable roll reveal pushes, event reminders, friction intent expirations |
| `fetch-local-beacons` | PostGIS radius query for active `map_beacons` near the user |
| `match-availability` | Overlapping availability intents on mutually kept connections → match alerts |

Companion (not in this folder): `send-push-notification` — invoked by cron and API routes for FCM/APNs delivery.

---

## Architecture

```
Client (mobile / web)
    │  Authorization: Bearer <user JWT>
    │  OPTIONS preflight → CORS headers
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Edge Function (Deno.serve)                                  │
│  • Validate JWT via admin.auth.getUser(jwt)                  │
│  • Service role or anon+JWT client for DB/RPC                │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
Postgres (RLS / service role) — proximity_handshake_events, connections,
  collaboration_sessions, map_beacons, availability_intents, system_friction_logs
```

### Deploy & schedule

```bash
supabase functions deploy bind-proximity-connection
supabase functions deploy fetch-local-beacons
supabase functions deploy match-availability
supabase functions deploy cron-hourly-maintenance --no-verify-jwt
```

Hourly cron is wired in migration `20260607120000_pg_cron_hourly_maintenance.sql` (not Vercel).

---

## CORS requirements (browser invoke)

All user-invoked functions expose identical CORS headers so browsers can call them from the Next.js dashboard or a web client:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

- **OPTIONS** → return `ok` with `corsHeaders` (preflight).
- **POST/GET** responses must spread `...corsHeaders` and set `Content-Type: application/json`.
- Clients must send `Authorization: Bearer <Supabase access token>` and `apikey` when using the Supabase JS `functions.invoke` helper.

`cron-hourly-maintenance` uses a narrower CORS set and is **not** intended for browser calls; it authorizes via `Bearer ${CRON_SECRET}` or service role.

---

## `bind-proximity-connection`

**POST** JSON body includes `my_token`, `tokens` / `heard_tokens`, GPS (`gps_lat` / `gps_lon` or `latitude` / `longitude`), sensor fields (`lux_level`, `motion_variance`, `compass_azimuth`, `battery_level`, barometric elevation, noise), `context_tags`, `timezone_offset_minutes`, optional `simulator_mock`.

### Matching pipeline

1. **Insert** row into `proximity_handshake_events` (ghost tap buffer).
2. **Load** peer rows within **5-minute** window (`GHOST_TTL_MS`).
3. **Graph build** — latest row per `user_id`, pairwise edges when:
   - Time delta ≤ 5 min
   - Token evidence: mutual hear **or** `heard_tokens` intersection
   - GPS ≤ **15 m** when both sides have valid coordinates (skipped if either lacks GPS)
4. **BFS clique** — `bfsComponent(uid, adj)` returns all transitively linked users (Multi-Tap / group connect).
5. **Connection ensure** — insert `connections` + `chats` when missing; `group_clique_candidate` when ≥3 members.
6. **Encounter** — `connection_encounters` with sensor payload; **debounce** within 50 m + same 12-hour UTC block → append `Extended Hangout` tag.
7. **Collaboration session** — `collaboration_sessions` row for Disposable Roll window on successful bind.

### Ghost taps

Unmatched handshake rows are retained ~**5 minutes** (`GHOST_TTL_MS`) so a delayed peer ping can still match. Cleanup deletes rows older than **6 minutes** (`CLEANUP_GRACE_MS`). For 3+ person clusters, the initiator's row may be kept longer so slower devices join the same graph.

### Confidence scoring

New proximity connections get `proximity_confidence`: **65** with GPS, **50** without. `proximity_signals` records `connection_method: 'proximity'`, `gps_available`, `bind_source`. Rows with confidence &lt; 20 are `flagged`.

### Response shape

`matches[]` with `is_new_connection`, `encounter_persisted_on_bind`, optional `connection_id`, `group_clique_candidate`, `encounter_id`, `collaboration_ttl`.

---

## `cron-hourly-maintenance`

Authorized server job (pg_cron). Three sub-routines per run:

| Step | Behavior |
|------|----------|
| **Disposable reveal** | Find `collaboration_sessions` where `collaboration_ttl` ≤ now and `notification_sent = false`. If a disposable message exists in chat (`metadata.disposable_roll`, `encounter_id`, `collaboration_ttl`), send **Click Drops** push via `send-push-notification`, then mark `notification_sent`. |
| **Event reminders** | HTTP GET `{CLICK_WEB_URL}/api/cron/event-reminders` with `CRON_SECRET`. Canonical logic in `lib/cron/eventReminders.ts`: **day-of** (event timezone) and **30-minutes-before** due-by-timestamp; sets `day_of_notification_sent` / `thirty_min_notification_sent`. |
| **Friction intent expirations** | Availability intents that expired in the last hour with **no** encounter during their window → insert `system_friction_logs` rows (`event_type: failed_conversion`) for B2B friction analytics. |

### 48-hour gentle archive

Archive semantics are enforced in Next.js cron/API (`/api/cron/hourly`, connection status transitions). This Edge Function does **not** run archive sweeps; it handles disposable reveal and intent friction only. Documented here because operators bundle it with “hourly maintenance” in runbooks.

---

## `match-availability`

**GET or POST** with user JWT.

1. Load connections containing the user; skip `archived` / `removed`.
2. **Mutually kept** filter: `should_continue[0] && should_continue[1]` **or** `expiry_state === 'kept'`.
3. Load non-expired `availability_intents` for user + peers.
4. **Tag normalization** — `intent_tag.trim().toLowerCase()` for equality.
5. **Timeframe overlap** — parse `ISO_START/ISO_END`, require `rangesOverlap`.
6. Return `matches[]` and optional `push_notification` payload (`type: availability_match`) for `send-push-notification`.

---

## `fetch-local-beacons`

**POST** `{ lat, lng, radius_meters? }` with user JWT.

- Uses **anon key + user JWT** client (RLS-aware).
- Calls RPC `fetch_map_beacons_within` — **PostGIS `ST_DWithin`** on beacon geometry.
- `radius_meters` clamped **100–50,000**; default **5000**.
- Returns `{ beacons: [...] }`.

---

## E2EE / API constraints

- Edge Functions see **ciphertext** in `messages.content` only when downstream chat routes insert E2EE payloads; bind functions do **not** decrypt chat.
- All user functions require a valid Supabase session JWT; service role is used internally for graph writes that bypass RLS.
- Rate limits: encounter inserts may hit `encounter_rate_limit_3h` (DB trigger); bind returns `reason: rate_limit_active` but may still open a collaboration session.

---

## Related files

| Path | Relationship |
|------|----------------|
| `app/api/connections/proximity/route.ts` | Newer async handshake (202 pending + GET poll) |
| `lib/server/proximity/bindProximityHandshake.ts` | Shared bind logic for Next.js route |
| `lib/server/proximity/matching.ts` | BFS, haversine, token normalization (parity with Edge) |
| `app/api/cron/hourly/route.ts` | Vercel mirror of disposable + friction slices |
| `app/api/cron/event-reminders/route.ts` | Event reminder push path |
| `lib/cron/eventReminders.ts` | Shared event reminder logic |
| `supabase/migrations/20260607120000_pg_cron_hourly_maintenance.sql` | pg_cron schedule |
| `supabase/migrations/20260605120000_system_friction_logs.sql` | Friction logging schema |
| `components/dashboard/ConnectionMap.tsx` | Client map consuming beacon APIs |

---

## What Click Users Experience

Click is built for **real-world connection**, not infinite scroll. Every feature below is part of the product surface this backend supports:

- **Connect in person (Tri-Factor)** — BLE + ultrasonic tokens + GPS prove two or more people are physically together; the bind functions turn that proof into a connection and Memory Capsule encounter.
- **Scan QR** — Time-limited QR tokens complement Tri-Factor; proximity Edge logic shares sensor enrichment patterns with `/api/qr`.
- **Group connect (Multi-Tap)** — Three or more simultaneous taps form a BFS clique; clients receive `group_clique_candidate` to start verified group chat.
- **Private encrypted chat** — E2EE messages live in `chats`/`messages`; bind only opens the connection and chat row.
- **Send photos/files/voice notes** — Chat attachments use encrypted media metadata; Disposable Rolls tie to `collaboration_sessions` created on bind.
- **Emoji reactions** — Realtime `message_reactions`; unrelated to Edge Functions but same social graph.
- **Typing & read receipts** — Client + API ack paths (`delivered_at`, `read_at`).
- **Voice & video calls** — LiveKit on web; `incoming_call` pushes from dashboard (separate function).
- **Memory Capsules** — Rich `connection_encounters` rows (weather, noise, context tags) written during bind.
- **48-hour gentle archive** — Connection lifecycle after pending window; hourly jobs do not delete user relationships abruptly.
- **Connection map & timeline** — Encounters power map pins and profile timeline.
- **Rate the vibe** — Post-connection vibe prompts feed encounter context.
- **QR identity card** — Dashboard QR generation uses `/api/qr`, not Edge bind.
- **Availability intents** — `match-availability` drives **match alerts** when schedules overlap on kept connections.
- **Match alerts** — Push-shaped payloads from match-availability.
- **Community Hubs** — Separate hub API; beacons Edge function feeds **map beacons**.
- **Map beacons** — `fetch-local-beacons` returns nearby drops, events, hazards, soundtracks.
- **Global search** — Dashboard connection search (client-side).
- **Core connections** — Pin trusted friends; beacon visibility can target `core_connections`.
- **Collaboration sessions & disposable rolls** — Created on bind; cron reveals drops after TTL.
- **Ghost mode** — Unmatched taps linger as ghost handshakes for late peers.
- **Block & report** — Safety APIs; archived connections excluded from match-availability.
- **Profile & interests** — User rows returned in `matches[]` profiles.
- **Onboarding** — Auth before any Edge invoke.
- **Google/email auth** — Supabase JWT on all calls.
- **Push notifications** — Cron invokes `send-push-notification` for drops and events.
- **Deep links & App Clip** — QR universal links; proximity is native-first.
- **Web dashboard** — Browser invokes Edge Functions with CORS headers above.
- **Business insights** — Friction logs from expired intents feed operator analytics.
- **Event reminders** — Hourly cron notifies beacon creators.
- **Achievements & stats** — Dashboard metrics from connection history.
