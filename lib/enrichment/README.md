# Event enrichment library (`lib/enrichment`)

Post-connection **knowledge graph** pipeline: resolve venues, link encounters to Ticketmaster/OSM events, classify **vibe** from sensor captures, and schedule backfills. Powers Memory Capsule context on dashboards and B2B venue intelligence.

---

## Purpose

Transform raw `connection_encounters` rows into structured `events_registry` links and vibe labels without blocking the hot connection path.

---

## Architecture

```
connection_encounters (insert on bind/QR)
    │
    ├─ POST /api/enrichment/event     → scheduleEventEnrichment
    ├─ runEncounterEnrichment.ts      → orchestrator
    └─ enrichmentPipeline.ts          → cache-first waterfall
            │
            ├─ eventCache.ts          (venue cache + registry)
            ├─ resolveEventVenue.ts   (name resolution)
            ├─ overpassClient.ts      (OSM POI)
            ├─ ticketmasterClient.ts  (events API)
            ├─ encounterVenueResolver.ts
            └─ vibeEnrichmentPipeline.ts
                    ├─ vibeClassification.ts
                    ├─ vibeCaptureSchema.ts
                    ├─ temporalProfiler.ts / astronomicalProfiler.ts
                    └─ spatialZoning.ts
```

### Event enrichment pipeline

`runEventEnrichmentPipeline(supabase, input)`:

**Input:** `{ encounter_id, lat, lon, timestamp, location_name?, semantic_location?, skip_overpass? }`

**Waterfall** (never throws — returns partial on API failure):

1. **Registry cache** — `findRegistryEventByVenueAndDate`
2. **Spatial venue cache** — `getVenueFromCache` (grid-snapped coords)
3. **Overpass** — POI lookup (skippable for speed)
4. **Ticketmaster** — `fetchEventFromTicketmaster`
5. **Sports fallback** — `fetchSportsFallbackEvent`
6. **Link** — `linkEncounterToEvent(encounter_id, event_id)`

### Venue resolution

- `encounterVenueResolver.ts` — combines Nominatim semantic_location, `location_name`, Overpass amenities
- `resolveEventVenue.ts` — normalizes venue naming for registry keys
- `gridCoords.ts` — spatial hashing for cache keys

### Vibe classification pipeline

`vibeEnrichmentPipeline.ts` + `vibeClassification.ts`:

- Reads `vibe_capture` JSONB and sensor columns (`lux_level`, `noise_level`, `motion_variance`, weather snapshot)
- Outputs context tags / vibe labels for dashboards and insights
- `connectionArchetype.ts` — social context archetypes (study session, nightlife, etc.)
- `academicCalendar.ts` — campus event windows (e.g. UW proximity)

### Scheduling

- `scheduleEventEnrichment.ts` — async job enqueue from API
- Scripts: `scripts/backfill_event_enrichment.ts`, `backfill_vibe_enrichment.ts`, `backfill_location_data.ts`

---

## E2EE / API constraints

- Enrichment reads **metadata only** — never message `content`.
- External API keys (Ticketmaster) are server-side env vars.
- `POST /api/enrichment/event` should require auth + connection participant (see route contract tests).

---

## Related files

| Path | Role |
|------|------|
| `app/api/enrichment/event/route.ts` | HTTP entry |
| `app/api/encounters/details/[encounter_id]/route.ts` | Enriched encounter detail |
| `types/enrichment-schema.ts` | Shared types |
| `supabase/migrations/20260602120000_event_enrichment_knowledge_graph.sql` | Schema |
| `supabase/migrations/20260503000000_add_vibe_capture_to_encounters.sql` | Vibe capture column |
| `lib/dashboard/connectionExtras.ts` | Displays weather/noise summaries |
| `lib/insights/connectionEncounterClustering.ts` | Map display of encounters |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Sensor payload feeds vibe classification.
- **Scan QR** — Same encounter enrichment.
- **Group connect (Multi-Tap)** — Group encounters enriched per member GPS.
- **Private encrypted chat** — Unaffected.
- **Send photos/files/voice notes** — Unaffected.
- **Emoji reactions** — Unaffected.
- **Typing & read receipts** — Unaffected.
- **Voice & video calls** — Unaffected.
- **Memory Capsules** — **Enriched** with event name, venue, vibe tags, weather narrative.
- **48-hour gentle archive** — Encounters persist for timeline.
- **Connection map & timeline** — Shows resolved place labels (`detailedEncounterLocation`).
- **Rate the vibe** — User vibe feeds `vibe_capture`.
- **QR identity card** — Entry point only.
- **Availability intents** — Separate from event registry.
- **Match alerts** — Unaffected.
- **Community Hubs** — Venue category may align with resolved POI.
- **Map beacons** — Event beacons link to enrichment timestamps.
- **Global search** — May search enriched context strings.
- **Core connections** — Unaffected.
- **Collaboration sessions & disposable rolls** — Parallel to enrichment.
- **Ghost mode** — If encounter logged, still enriches.
- **Block & report** — Unaffected.
- **Profile & interests** — Timeline shows enriched moments.
- **Onboarding** — Unaffected.
- **Google/email auth** — Unaffected.
- **Push notifications** — Unaffected.
- **Deep links & App Clip** — Unaffected.
- **Web dashboard** — Connection cards show weather/noise/event context.
- **Business insights** — Venue-level aggregation from enriched encounters.
- **Event reminders** — Event beacon metadata from map layer.
- **Achievements & stats** — Milestones may reference places/events.
