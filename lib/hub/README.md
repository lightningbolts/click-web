# Community Hub library (`lib/hub`)

Place-scoped chat spaces with geofenced participation and thin API routes for create/nearby/messages/media/leave. Hubs are **not** E2EE connection chats — they are location-bound rooms with server-enforced proximity. **Hubs do not expire** (`hub_venues.expires_at` is null).

---

## Purpose

| Module | Role |
|--------|------|
| `hubGatekeeper.ts` (in `lib/server/`) | Haversine geofence check against `hub_venues` |

Mobile **Community Hubs** feature creates a hub at a place; web dashboard can participate when on-site.

---

## Architecture

```
POST /api/hub/create
    │ expires_at = null (permanent)
    ▼
hub_venues + hub_participants
    │
    ├─ GET  /api/hub/nearby        (discover within radius)
    ├─ GET  /api/hub/messages      (participant-gated thread + participant_ids)
    ├─ POST /api/hub/messages      (assertHubGeofenceFromCoords)
    ├─ POST /api/hub/media         (geofenced uploads)
    ├─ POST /api/hub/leave
    └─ GET  /api/hub/[id]          (hub detail)
```

### `hubGatekeeper` — haversine geofence

`assertHubGeofenceFromCoords(admin, hubId, userLat, userLong)`:

1. Load `hub_venues` — `geofence_lat`, `geofence_long`, `radius_meters` (default **50 m**), `expires_at`
2. Reject if `expires_at` is set and past (**410** `HUB_EXPIRED`) — rare; new hubs never set expiry
3. `haversineMeters(user, venue) > radius` → **400** `OUT_OF_BOUNDS` with `distance_meters`

Matches mobile `verify-hub-proximity` Edge Function semantics (geofence; that function does not gate on expiry).

---

## Hub API routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/hub/create` | POST | `{ name, category, location: { lat, lng, radius_meters? } }` — inserts venue + creator participant |
| `/api/hub/nearby` | GET | Query lat/lng/radius — list hubs (`expires_at` null or future) |
| `/api/hub/[id]` | GET | Hub metadata + participant counts |
| `/api/hub/[id]/participants/me` | GET/PATCH | Self participant row |
| `/api/hub/messages` | GET | `hubId` + optional `aroundMessageId` — participant-gated timeline + `participant_ids` |
| `/api/hub/messages` | POST | Text message (geofence required). No per-send timed cooldown. |
| `/api/hub/media` | POST | Media attachment (geofence required) |
| `/api/hub/leave` | POST | Leave hub |

Auth: `requireBearerUser` from `chatGatekeeper` (JWT validation only; hub writes use geofence, not connection membership).

---

## E2EE / API constraints

- Hub messages are **not** connection-scoped E2EE; treat as venue chat at rest with RLS.
- Geofence coordinates are sent per request — server does not trust cached client location without fresh lat/lng.
- Venue lifetime is permanent unless an admin sets `expires_at`.

---

## Related files

| Path | Role |
|------|------|
| `lib/server/hubGatekeeper.ts` | Geofence enforcement |
| `lib/hub/hubThread.ts` | Timeline normalize + around-window merge |
| `app/api/hub/create/route.ts` | Hub creation |
| `app/api/hub/nearby/route.ts` | Discovery |
| `app/api/hub/messages/route.ts` | GET hydrate / POST send |
| `app/api/hub/media/route.ts` | Media |
| `app/api/hub/leave/route.ts` | Leave |
| `supabase/migrations/20260511120000_hub_ephemeral_participants_and_users_aura.sql` | Schema |
| `supabase/migrations/20260807000000_hub_venues_no_expiry.sql` | Clear expiry; permanent hubs |
| `lib/location/detailedEncounterLocation.ts` | Place label formatting (shared patterns) |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Separate from hubs; hubs are venue communities.
- **Scan QR** — Pairwise connection, not hub join.
- **Group connect (Multi-Tap)** — Verified clique, not hub broadcast.
