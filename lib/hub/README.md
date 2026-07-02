# Community Hub library (`lib/hub`)

Ephemeral venue-scoped chat spaces: **24-hour TTL**, geofenced participation, and thin API routes for create/nearby/messages/media/leave. Hubs are **not** E2EE connection chats — they are location-bound public-ish rooms with server-enforced proximity.

---

## Purpose

| Module | Role |
|--------|------|
| `ephemeralHubTtl.ts` | Server-authoritative **24h** expiry computation |
| `hubGatekeeper.ts` (in `lib/server/`) | Haversine geofence check against `hub_venues` |

Mobile **Community Hubs** feature creates a hub at a place; web dashboard can participate when on-site.

---

## Architecture

```
POST /api/hub/create
    │ computeEphemeralHubExpiry() → expires_at
    ▼
hub_venues + hub_participants
    │
    ├─ GET  /api/hub/nearby        (discover within radius)
    ├─ POST /api/hub/messages      (assertHubGeofenceFromCoords)
    ├─ POST /api/hub/media         (geofenced uploads)
    ├─ POST /api/hub/leave
    └─ GET  /api/hub/[id]          (hub detail)
```

### `ephemeralHubTtl.ts`

```typescript
computeEphemeralHubExpiry(nowMs?) → {
  expires_at_iso,  // now + 24h
  expires_at_ms,
  ttl_ms: 86_400_000
}
```

**Constraint:** Clients must **not** compute hub expiry locally — always use server-returned `expires_at` from create response.

### `hubGatekeeper` — haversine geofence

`assertHubGeofenceFromCoords(admin, hubId, userLat, userLong)`:

1. Load `hub_venues` — `geofence_lat`, `geofence_long`, `radius_meters` (default **50 m**), `expires_at`
2. Reject if hub expired (**410**)
3. `haversineMeters(user, venue) > radius` → **400** `OUT_OF_BOUNDS` with `distance_meters`

Matches mobile `verify-hub-proximity` Edge Function semantics.

---

## Hub API routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/hub/create` | POST | `{ name, category, location: { lat, lng, radius_meters? } }` — inserts venue + creator participant |
| `/api/hub/nearby` | GET | Query lat/lng/radius — list active hubs |
| `/api/hub/[id]` | GET | Hub metadata + participant counts |
| `/api/hub/[id]/participants/me` | GET/PATCH | Self participant row |
| `/api/hub/messages` | POST | Text message (geofence required) |
| `/api/hub/media` | POST | Media attachment (geofence required) |
| `/api/hub/leave` | POST | Leave hub |

Auth: `requireBearerUser` from `chatGatekeeper` (JWT validation only; hub writes use geofence, not connection membership).

---

## E2EE / API constraints

- Hub messages are **not** connection-scoped E2EE; treat as ephemeral plaintext at rest with RLS.
- Geofence coordinates are sent per request — server does not trust cached client location without fresh lat/lng.
- Hub TTL is wall-clock 24h from creation, independent of collaboration session / disposable roll TTLs.

---

## Related files

| Path | Role |
|------|------|
| `lib/server/hubGatekeeper.ts` | Geofence enforcement |
| `app/api/hub/create/route.ts` | Hub creation |
| `app/api/hub/nearby/route.ts` | Discovery |
| `app/api/hub/messages/route.ts` | Messaging |
| `app/api/hub/media/route.ts` | Media |
| `app/api/hub/leave/route.ts` | Leave |
| `supabase/migrations/20260511120000_hub_ephemeral_participants_and_users_aura.sql` | Schema |
| `lib/location/detailedEncounterLocation.ts` | Place label formatting (shared patterns) |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Separate from hubs; hubs are venue communities.
- **Scan QR** — Pairwise connection, not hub join.
- **Group connect (Multi-Tap)** — Verified clique, not hub broadcast.
- **Private encrypted chat** — 1:1/group connection chats only.
- **Send photos/files/voice notes** — Hub media route (geofenced).
- **Emoji reactions** — Connection chat feature.
- **Typing & read receipts** — Connection chat.
- **Voice & video calls** — LiveKit between connections.
- **Memory Capsules** — Encounters, not hub messages.
- **48-hour gentle archive** — Connection lifecycle.
- **Connection map & timeline** — Personal graph.
- **Rate the vibe** — Post-connection.
- **QR identity card** — Personal identity.
- **Availability intents** — Broadcast availability; hubs are place-based.
- **Match alerts** — Intent overlap on connections.
- **Community Hubs** — **Core feature**: join nearby hub within geofence, chat for 24h.
- **Map beacons** — Complementary map layer at same venues.
- **Global search** — Dashboard.
- **Core connections** — Private graph.
- **Collaboration sessions & disposable rolls** — Connection-scoped.
- **Ghost mode** — Proximity handshakes.
- **Block & report** — Safety on connections/users.
- **Profile & interests** — Hub shows display names.
- **Onboarding** — Auth required.
- **Google/email auth** — Session for hub APIs.
- **Push notifications** — Hub-specific pushes (if enabled client-side).
- **Deep links & App Clip** — May open venue flows.
- **Web dashboard** — Can browse nearby hubs when location granted.
- **Business insights** — Venue operators see intent radar near hubs.
- **Event reminders** — Event beacons on map.
- **Achievements & stats** — Connection-based.
