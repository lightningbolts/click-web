# Connections library (`lib/connections`)

Shared helpers for proximity encounter sensor payloads and connection-adjacent normalization. HTTP routes under `app/api/connections/*` implement QR, proximity bind, lifecycle, core pins, and collaboration entry points.

---

## Purpose

- **`encounterSensorPayload.ts`** — Map client `sensor_data` JSON into `connection_encounters` insert columns without polluting the parent `connections` row
- **Route orchestration** — Document how web/mobile create, restore, archive, and enrich connections

Proximity **matching algorithms** live in `lib/server/proximity/` and `supabase/functions/bind-proximity-connection/`; this folder holds encounter shape utilities consumed by encounter APIs.

---

## Cross-platform parity (connection creation)

| Path | Mobile | click-web | Achievable on web? |
|------|--------|-----------|-------------------|
| **Tri-Factor proximity** | `ConnectionViewModel` + BLE/ultrasonic/GPS | `POST /api/connections/proximity` (async 202) | **Initiation: mobile only.** Web route exists for bind/poll; browsers lack hardware mesh. |
| **Multi-Tap cliques (3+)** | In-room simultaneous handshakes | BFS in `matching.ts` / Edge Function | **Initiation: mobile only.** Web can persist clique results. |
| **QR connect** | Scans via `CLICK_WEB_BASE_URL` | `GET/POST /api/qr`, `QRIdentityCard` | **Full parity** — primary web-native connect path. |
| **Simulator mock** | `MockProximityManager` | `simulator_mock: true`, tokens `1234`/`5678` | **Dev/test only** — `bindProximityHandshake.ts`; seeds connections without hardware. |
| **Manual encounter** | Reconnect flows | `POST /api/connections/encounter` | Parity for logging encounters with sensor JSON. |
| **Insights opt-in** | `includeInInsightsEnabled` setting | `include_in_business_insights` on bind | Mobile setting drives B2B aggregate eligibility. |

Mobile calls web for QR issuance and redemption; Tri-Factor payloads typically hit the Edge Function from the app, with Next.js `bindProximityHandshake` as an alternate path. For local insights pilot testing without devices, use `simulator_mock` (documented in `lib/insights/README.md` § Real-world testing).

---

## Architecture

```
Mobile / Web
    │
    ├─ POST /api/connections/proximity  ──► bindProximityHandshake (async 202)
    ├─ GET  /api/qr                       ──► 90s single-use token
    ├─ POST /api/qr                       ──► redeem_qr_token RPC + encounter
    ├─ POST /api/connections              ──► create/restore pair (unique_user_pair)
    ├─ POST /api/connections/encounter    ──► manual encounter + sensor payload
    └─ GET/POST /api/connections/core       ──► core connection pins
```

### Proximity validation

Two paths (keep semantics aligned):

| Path | Transport | Pending behavior |
|------|-----------|------------------|
| **Edge** `bind-proximity-connection` | Supabase Functions | Synchronous match in 5m ghost window |
| **Next.js** `/api/connections/proximity` | Route Handler | **202 Accepted** + `pending_handshake_id`; GET poll when peer arrives |

Shared rules (`lib/server/proximity/matching.ts`):

- Token normalization — last 4 digits, zero-padded
- GPS ≤ **15 m** when both have coordinates
- Token evidence — mutual hear or heard-token intersection
- **BFS** for Multi-Tap cliques (3+ users)
- Candidate fetch — **geo-scoped** + **token-scoped** pending rows (bounded; never full-table scan)
- Host selection defer — first-time multi-peer returns `awaiting_selection`; create via `confirmProximitySelection` with selection size cap **≤12** (`PROXIMITY_HOST_SELECTION_MAX_MEMBERS`)
- Encounter debounce — 50 m, same 12-hour UTC block → `Extended Hangout`

### QR token lifecycle

**GET `/api/qr`**

- Auth required
- Inserts `qr_tokens` row: 32-byte hex token, **90s TTL**, optional `initiator_lat/lon`
- Returns universal link payload (`/c/{userId}?token=…`) plus legacy `click://` deep link fields

**POST `/api/qr`**

- Body `{ token, scannerLocation?, sensor fields… }`
- Atomic redeem via `redeem_qr_token(p_token, p_scanner_lat, p_scanner_lon)` RPC
- Failures: `expired`, `already_used`, `not_found`, **`proximity_failed`** (scanner too far from initiator)
- On existing connection: inserts `connection_encounters` + `collaboration_sessions`
- **Does not** create `connections` row — caller uses `POST /api/connections` for pair persistence

### `encounterSensorPayload.ts`

`buildEncounterInsertFromSensor(connectionId, sensorData)`:

- Known keys → encounter columns: `gps_lat`, `gps_lon`, `lux_level`, `motion_variance`, `compass_azimuth`, `battery_level`, `noise_level`, `weather_snapshot`, `semantic_location`, `context_tags`, etc.
- Unknown keys → folded into `vibe_capture` JSONB

### `connectionExtras` (dashboard)

Lives in `lib/dashboard/connectionExtras.ts` (consumed by connections UI):

- `extractEventContext`, `extractWeatherSummary`, `extractNoiseSummary`
- `normalizeNoiseCategory`, `formatNoiseCategory`
- Reads latest `connection_encounters` embed + legacy `memory_capsule` fields

---

## `/api/connections/*` routes overview

| Route | Methods | Role |
|-------|---------|------|
| `/api/connections` | GET, POST | List/create/restore connections |
| `/api/connections/proximity` | POST, GET | Async Tri-Factor bind + pending poll (`awaiting_selection` for first-time multi-peer) |
| `/api/connections/proximity/confirm` | POST | Host confirms selected members after `awaiting_selection` (≤12) |
| `/api/connections/encounter` | POST | Log encounter with sensor payload |
| `/api/connections/core` | GET, POST, DELETE | Core connection pins |
| `/api/connections/archive` | POST | Gentle archive |
| `/api/connections/unarchive` | POST | Restore from archive |
| `/api/connections/hide` | POST | Hide from active list |
| `/api/connections/[id]/tags` | PATCH | Connection tags |
| `/api/connections/[id]/tabs` | GET | Chat tabs metadata |
| `/api/connections/[id]/venue-vibe` | POST | Post-connection vibe |
| `/api/connections/[id]/collaboration-session` | POST | Open disposable window |

`proxy.ts` rate-limits **mutations** on `/api/connections/*` (10/min/IP).

---

## E2EE / API constraints

- Connection APIs never touch message plaintext; chat keys derive from `connection_id` + sorted `user_ids`.
- Proximity and QR routes use **service role** for token redemption and handshake tables.
- Encounter rate limit (`encounter_rate_limit_3h`) may block insert but still return collaboration session for re-engagement.

---

## Related files

| Path | Role |
|------|------|
| `app/api/qr/route.ts` | QR GET/POST implementation |
| `app/api/connections/proximity/route.ts` | Async proximity handshake |
| `lib/server/proximity/bindProximityHandshake.ts` | Bind orchestration |
| `lib/server/proximity/matching.ts` | Graph + haversine |
| `lib/dashboard/connectionExtras.ts` | Display normalization |
| `lib/dashboard/connectionEncounters.ts` | `latestEncounter` helper |
| `lib/collaboration/createCollaborationSession.ts` | Roll window on bump |
| `supabase/functions/bind-proximity-connection/index.ts` | Legacy Edge bind |
| `types/supabase-json.ts` | `ProximityHandshakeRequest` types |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Primary flow via proximity API; sensors become Memory Capsule rows.
- **Scan QR** — 90-second rotating QR; must be physically near initiator.
- **Group connect (Multi-Tap)** — Clique detection; first-time multi-peer defers create until host confirms selection (≤12).
- **Private encrypted chat** — Created when connection row + chat row exist.
- **Send photos/files/voice notes** — After connection active.
- **Emoji reactions** — In chat, not connection APIs.
- **Typing & read receipts** — Chat layer.
- **Voice & video calls** — Require active connection between participants.
- **Memory Capsules** — `connection_encounters` with weather, noise, GPS, context tags.
- **48-hour gentle archive** — Archive routes soft-hide stale pending connections.
- **Connection map & timeline** — Encounters feed map pins and profile timeline.
- **Rate the vibe** — `venue-vibe` route after hangout.
- **QR identity card** — Dashboard GET `/api/qr`.
- **Availability intents** — Separate user intents API.
- **Match alerts** — Requires mutually kept connection from this graph.
- **Community Hubs** — Parallel social layer at venues.
- **Map beacons** — Drops at encounter locations.
- **Global search** — Dashboard search over connections.
- **Core connections** — Pin inner circle; affects beacon visibility audience.
- **Collaboration sessions & disposable rolls** — Opened on every bump (QR, proximity).
- **Ghost mode** — Pending handshakes for late peers (proximity 202 path).
- **Block & report** — Safety routes remove abusive pairs.
- **Profile & interests** — Shown when previewing connection peer.
- **Onboarding** — Auth before QR/proximity.
- **Google/email auth** — Bearer on all routes.
- **Push notifications** — Match alerts, drops (downstream).
- **Deep links & App Clip** — `/c/{userId}` universal links with token query params.
- **Web dashboard** — Connection table, map, QR card.
- **Business insights** — Aggregated encounter coordinates (anonymized).
- **Event reminders** — Map beacon metadata.
- **Achievements & stats** — Connection counts and milestones.
