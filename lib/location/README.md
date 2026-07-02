# Location library (`lib/location`)

Geospatial **display helpers** and documentation of **haversine** / **geofence** patterns used across hub, map, proximity, and enrichment modules. Primary implementation files are colocated with their domains; this folder holds shared formatting utilities.

---

## Purpose

- **`detailedEncounterLocation.ts`** — Format encounter place labels matching mobile app copy
- **Document** haversine distance checks and geofence defaults used in `hubGatekeeper`, proximity matching, map clustering, and QR proximity RPC

---

## Architecture

Haversine implementations (equivalent Earth radius **6,371,000 m**):

| Location | Function | Threshold |
|----------|----------|-----------|
| `lib/server/proximity/matching.ts` | `haversineMeters` | ≤ **15 m** proximity match |
| `lib/server/hubGatekeeper.ts` | `haversineMeters` | ≤ `hub_venues.radius_meters` (default **50 m**) |
| `lib/server/proximity/bindProximityHandshake.ts` | debounce check | ≤ **50 m** extended hangout |
| `components/dashboard/ConnectionMap.tsx` | inline haversine | ≤ **10 ft** marker grouping |
| `lib/enrichment/academicCalendar.ts` | `haversineKm` | Campus zone checks |
| `supabase/functions/bind-proximity-connection/index.ts` | `haversineMeters` | Same as matching.ts |

### `detailedEncounterLocation.ts`

`formatDetailedEncounterLocation({ locationName, displayLocation, semanticLocation })`:

Produces mobile-parity string:

```
[location_name] • [neighbourhood], [display_location]
```

- `parseSemanticLocationNeighbourhood` — reads Nominatim `address.neighbourhood`
- Safe fallbacks when parts missing (name only, city only, etc.)

Used by dashboard connection cards and profile surfaces.

### Geofence helpers (hub / map)

**Hub geofence** (`assertHubGeofenceFromCoords`):

1. Load venue center + radius
2. Reject expired hubs (410)
3. Return `OUT_OF_BOUNDS` + `distance_meters` when user outside radius

**QR proximity** — enforced in `redeem_qr_token` RPC (scanner vs initiator coordinates), not in this folder.

**Map** — no hard geofence; beacons filtered by PostGIS radius in `fetch_map_beacons_within` RPC.

### Valid GPS guard

Shared pattern (see `lib/insights/connectionEncounterClustering.ts` `isValidGpsCoordinate`):

- Reject null, non-finite, `(0,0)`, out-of-range lat/lng

---

## E2EE / API constraints

- Location data is **not** encrypted — stored in `connection_encounters` and beacon rows.
- Clients send GPS on proximity/QR/hub requests; server validates ranges (-90..90 lat, -180..180 lng).
- Raw per-member GPS preserved on bind (no server-side averaging) — centroid only for map **display**.

---

## Related files

| Path | Role |
|------|------|
| `lib/server/hubGatekeeper.ts` | Hub geofence |
| `lib/server/proximity/matching.ts` | Proximity haversine |
| `lib/server/terrainElevation.ts` | Elevation at lat/lng |
| `lib/map/mapBeacons.ts` | Beacon lat/lng parse |
| `lib/enrichment/gridCoords.ts` | Spatial cache grid |
| `lib/dashboard/connectionExtras.ts` | display_location strings |
| `components/dashboard/ConnectionMap.tsx` | Greedy cluster by distance |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — GPS proof ≤15 m; barometric elevation optional.
- **Scan QR** — Scanner must be near initiator GPS from token row.
- **Group connect (Multi-Tap)** — Each member's GPS stored separately.
- **Private encrypted chat** — No location in ciphertext.
- **Send photos/files/voice notes** — EXIF stripped on upload (client policy).
- **Emoji reactions** — N/A.
- **Typing & read receipts** — N/A.
- **Voice & video calls** — N/A.
- **Memory Capsules** — **Place labels** from this formatting module.
- **48-hour gentle archive** — N/A.
- **Connection map & timeline** — Pins from encounter coordinates.
- **Rate the vibe** — Location context in encounter.
- **QR identity card** — Optional GPS on generate.
- **Availability intents** — Anonymized cell ID (not precise GPS in B2B).
- **Match alerts** — N/A.
- **Community Hubs** — **Geofence required** to post.
- **Map beacons** — Dropped at current lat/lng.
- **Global search** — N/A.
- **Core connections** — N/A.
- **Collaboration sessions & disposable rolls** — N/A.
- **Ghost mode** — May omit/redact location on client.
- **Block & report** — N/A.
- **Profile & interests** — "Met at" strings formatted here.
- **Onboarding** — Location permission explainers.
- **Google/email auth** — N/A.
- **Push notifications** — May deep link to map coordinates.
- **Deep links & App Clip** — Location when connecting.
- **Web dashboard** — Map + formatted addresses.
- **Business insights** — Aggregated hexbins, not precise user GPS.
- **Event reminders** — Event beacon location on map.
- **Achievements & stats** — Places visited counts.
