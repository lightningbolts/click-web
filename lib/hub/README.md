# Community Hub library (`lib/hub`)

Place-scoped chat spaces with thin API routes for create/nearby/messages/media/leave. Standalone hubs use a geofence; event hubs use active event check-in (or host status) and expire after their configured event window. Hubs are **not** E2EE connection chats.

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
    ├─ GET  /api/hub/messages      (authoritative access + privacy-safe participant data)
    ├─ POST /api/hub/messages      (fresh geofence or active event check-in)
    ├─ GET/POST /api/hub/media     (authorized short-lived media URLs)
    ├─ POST /api/hub/leave
    └─ GET  /api/hub/[id]          (hub detail)
```

### `hubGatekeeper` — haversine geofence

`assertHubGeofenceFromCoords(admin, hubId, userLat, userLong)`:

1. Load `hub_venues` — `geofence_lat`, `geofence_long`, `radius_meters` (default **50 m**), `expires_at`
2. Reject if `expires_at` is set and past (**410** `HUB_EXPIRED`) — rare; new hubs never set expiry
3. `haversineMeters(user, venue) > radius` → **400** `OUT_OF_BOUNDS` with `distance_meters`

`assertHubReadable(admin, hubId, userId)` is the shared read/search gate. It rechecks event check-in and expiry for event hubs instead of trusting a stale `hub_participants` row. Standalone hubs require current participant membership.

---

## Hub API routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/hub/create` | POST | `{ name, category, location: { lat, lng, radius_meters? } }` — inserts venue + creator participant |
| `/api/hub/nearby` | GET | Query lat/lng/radius — list hubs (`expires_at` null or future) |
| `/api/hub/[id]` | GET | Hub metadata after authoritative access check; event-owned hubs cannot be patched/deleted directly |
| `/api/hub/[id]/participants/me` | GET/PATCH | Self participant row |
| `/api/hub/messages` | GET | `hubId` + optional `aroundMessageId` — active event access or current standalone membership. `hosts_only` events return occupant count without participant IDs. |
| `/api/hub/messages` | POST | Text message (fresh geofence or active event check-in), limited to 30 sends per user/hub per minute. |
| `/api/hub/media` | POST | Private media upload; maximum 25 MiB and 6 uploads per user/hub per minute; returns object path, bucket, and a five-minute signed URL. |
| `/api/hub/media` | GET | `hubId` + object path — rechecks access and mints a five-minute signed URL. |
| `/api/hub/leave` | POST | Leave hub |

Auth: `requireBearerUser` from `chatGatekeeper` (JWT validation only; hub writes use geofence, not connection membership).

---

## E2EE / API constraints

- Hub messages are **not** connection-scoped E2EE; treat as server-readable venue chat at rest.
- Geofence coordinates are sent per request — server does not trust cached client location without fresh lat/lng.
- New hub media uses the private `hub-media` bucket. Persist `media_path` and `media_bucket`, never signed URLs. Legacy `media_url` records remain readable during migration.
- Event hubs are inaccessible after expiry or check-out. Event hosts must edit/delete the event rather than its linked hub.

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
