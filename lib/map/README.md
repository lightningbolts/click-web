# Map library (`lib/map`)

**MapLibre GL** helpers for community **map beacons**: type taxonomy, GeoJSON feature builders, visibility rules, popup HTML, event scheduling, and **greedy / supercluster** layering used by `ConnectionMap.tsx`.

---

## Purpose

- Parse and normalize `map_beacons` rows from PostGIS-backed APIs
- Build clustered GeoJSON sources for official / community / hazard layers
- Enforce beacon TTL, visibility audience, and safe external URIs (Spotify)

---

## Architecture

```
GET /api/map/beacons  or  fetch-local-beacons Edge Function
    │
    ▼
mapBeacons.ts — parseMapBeacon, beaconGeoJsonFeatures
    │
    ▼
ConnectionMap.tsx (MapLibre)
    ├─ connections layer — greedy 10ft clustering (custom)
    ├─ beacons layers — MapLibre cluster (supercluster)
    │     CLUSTER_MAX_ZOOM=14, RADIUS=52
    │     BEACON_CLUSTER_MAX_ZOOM=16, RADIUS=44
    └─ popup — beaconPopupHtml.ts
```

### MapLibre beacons layer

`beaconGeoJsonFeatures(beacons, group)` emits Point features with properties:

| Property | Use |
|----------|-----|
| `beacon_type` | Cluster aggregation field |
| `tint` | Pin color from `beaconTint()` / `generateCardVisual` |
| `icon_char` | Unicode glyph per type |
| `pin_shape` | Distinct silhouette per beacon type (mobile + popup identity) |
| `title` | `displayTitleForBeacon()` |
| `spotify` | Safe playlist URI for soundtrack beacons |

**Layer groups:** `official` (verified soundtracks), `community`, `hazard` (hazard/utility/SOS).

### Greedy clustering (connections)

`ConnectionMap.tsx` `spreadOverlappingConnections`:

- Groups connection markers within **10 feet** (~3 m) haversine
- Picks centroid for marker position; stacks popover for grouped list
- Separate from beacon supercluster — personal network vs map drops

### Beacon TTL

- Every `MapBeaconRecord` has `expires_at` ISO timestamp
- PostGIS RPC / API filter `expires_at > now()`
- Event beacons additionally use `metadata.event_end_at` for reminders (`lib/map/eventSchedule.ts`)

### Beacon types

`MAP_BEACON_TYPES`: `soundtrack`, `hazard`, `utility`, `swag`, `capacity`, `recreation`, `transit`, `sos`, `study`, `hobby`, `scavenger`, `event`, etc.

### Visibility audience

`BeaconVisibilityAudience`: `everyone` | `connections` | `core_connections` — filtered in `beaconVisibility.ts` and API routes before map fetch.

### Event engagement (related APIs)

Event beacons support server-backed bookmarks / check-ins / impressions (not MapLibre layers). Routes under `app/api/beacons/[beaconId]/{bookmark,check-in,engagement,impressions}` plus `GET /api/me/event-bookmarks`. Public directory: `GET /api/beacons/public-events`. Share landing: `GET /api/beacons/[beaconId]/public` (selects `creator_id`, cover, description, `rsvp_count`). Guest RSVP: `POST /api/beacons/[beaconId]/rsvp/guest`. Create/edit may set `metadata.venue_scale` + `check_in_radius_meters`. See `lib/server/eventEngagement.ts`, `lib/events/`, and `docs/ui-ux/05-events.md`.

---

## E2EE / API constraints

- Map APIs return public beacon metadata only — no chat ciphertext.
- `POST /api/map/drop` requires auth; creator_id stamped server-side.
- Spotify URIs validated with `isSafeBeaconUri` (`spotify:` or `https://` only).

---

## Related files

| Path | Role |
|------|------|
| `components/dashboard/ConnectionMap.tsx` | MapLibre UI + clustering config |
| `components/landing/playground/PlaygroundMap.tsx` | Landing demo map — mock pins, Carto CDN tiles, **no Click APIs** |
| `components/landing/playground/playgroundMapStyle.ts` | Seattle bounds, Carto URLs, Worker-safe `transformRequest` |
| `components/landing/playground/PlaygroundMapLazy.tsx` | `next/dynamic` so MapLibre is not on anonymous `/` |
| `app/api/map/beacons/route.ts` | List beacons |
| `app/api/map/beacons/[beaconId]/route.ts` | Single beacon |
| `app/api/map/drop/route.ts` | Create beacon |
| `app/api/beacons/route.ts` | Alternate list endpoint (+ venue scale on event create) |
| `app/api/beacons/image/route.ts` | Unencrypted beacon photo upload (JWT, 2 MB) to `avatars/{userId}/beacons/...` (RLS-safe) |
| `app/api/beacons/[beaconId]/bookmark/route.ts` | Event bookmark |
| `app/api/beacons/[beaconId]/check-in/route.ts` | Event check-in (geofenced) |
| `app/api/beacons/[beaconId]/engagement/route.ts` | Bookmark + check-in state |
| `app/api/me/event-bookmarks/route.ts` | Caller’s saved events |
| `lib/map/beaconVisibility.ts` | Audience filtering |
| `lib/map/mapBeaconApiShared.ts` | Shared route logic |
| `lib/map/beaconPopupHtml.ts` | Popup templates |
| `lib/map/beaconSoundtrackEnrichment.ts` | Soundtrack share URL → iTunes preview/art/track metadata |
| `lib/map/eventSchedule.ts` | Event window helpers |
| `supabase/functions/fetch-local-beacons/index.ts` | Mobile radius fetch |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Encounters appear on personal connection layer.
- **Scan QR** — Encounter GPS on map.
- **Group connect (Multi-Tap)** — Group hangouts on map.
- **Private encrypted chat** — Unaffected.
- **Send photos/files/voice notes** — Unaffected.
- **Emoji reactions** — Unaffected.
- **Typing & read receipts** — Unaffected.
- **Voice & video calls** — Unaffected.
- **Memory Capsules** — Pin atmosphere in connection popups.
- **48-hour gentle archive** — Archived connections hidden from active map layer.
- **Connection map & timeline** — **Core map feature** with greedy clustering.
- **Rate the vibe** — May inform beacon drops.
- **QR identity card** — Separate from map.
- **Availability intents** — Shown in B2B radar, not consumer map pins.
- **Match alerts** — Push, not map.
- **Community Hubs** — Venue geofence complementary to beacons.
- **Map beacons** — **Core feature** — drops, events, hazards, soundtracks.
- **Global search** — Dashboard connection search.
- **Core connections** — Beacon visibility `core_connections` audience.
- **Collaboration sessions & disposable rolls** — Squad drops may create beacons.
- **Ghost mode** — Unaffected.
- **Block & report** — Safety.
- **Profile & interests** — Creator name on beacons when allowed.
- **Onboarding** — Location permission for nearby beacons.
- **Google/email auth** — Required for drops.
- **Push notifications** — Event reminder pushes.
- **Deep links & App Clip** — Open map/beacon IDs.
- **Web dashboard** — Full MapLibre map with layer toggles.
- **Business insights** — Beacon density on Vibe Radar.
- **Event reminders** — Event beacon type + cron.
- **Achievements & stats** — Map exploration milestones.
