# Click Places — Product + Architecture Brainstorm

**Status:** exploration memo. Nothing here is implemented, and nothing here changes production behavior.
**Grounding:** `click-web` (Next.js BFF and the canonical Supabase migrations) and `click-ios` (native Swift client), branch `claude/vibrant-hamilton-g3beyz`, inspected 2026-10-01. Where repository docs disagree with code, this memo follows the code.

**Legend.** Each architectural claim carries one of these tags:

| Tag | Meaning |
|---|---|
| **[EXISTS]** | In the code or schema today |
| **[REUSE]** | Exists and can be used as-is |
| **[EXTEND]** | Exists; needs additive fields or behavior |
| **[NEW]** | Genuinely new functionality |
| **[SPECULATIVE]** | Longer-term idea; not part of the MVP |

---

## 0. Summary

1. **Don't build a parallel Place model. Promote `venues`.** Click already has a persistent physical-business entity. It has RBAC (`venue_managers`), billing (Stripe columns), an event link (`map_beacons.venue_id`), event telemetry keyed by venue (`event_engagement_events.venue_id`) and a full Insights surface. Today it is B2B-only and invisible to consumers. A Click Place is a `venues` row that has been made public, verified and placed on the map.
2. **The real duplication is `hub_venues`.** It is a second, consumer-side representation of physical places. It has a TEXT id, a geofence, permanent standalone hubs that any user can create, and no foreign key to `venues`. If Places ship without reconciling the two, Click will have two pins for the same café. The fix is small: a Place may *own* one hub (`hub_venues.venue_id`). Hubs stay hubs.
3. **Presence must come from explicit, foreground actions Click already has.** These are event check-ins, handshakes at the Place and a new explicit "I'm here" Place check-in. There should be no background visit tracking for Places. `VisitMonitor` (CLVisit) already exists, but it should stay scoped to the opt-in reconnect nudge.
4. **Pulse, not reviews.** Pulse is 1–3 taps of structured, time-decaying signal ("lively / chill", "easy to talk", "would come back at this time"). Only people with a recent presence proof can submit one. It is shown only above a sample threshold, and it is never a star rating.
5. **Consumer value has to come from the graph and from events, not from the directory.** "What's on here tonight", "is it lively right now (with honest confidence)" and "you've met 3 Clicks here" are things a POI app cannot say. A generic place directory would be a worse Yelp.
6. **Several existing gaps must be fixed first, whatever the Place decision.** See §1.3. Venue creation is unverified. `venue_check_ins` has a manager-readable per-user RLS policy. Venue connection metrics depend on a column that no bind path writes. The mobile "Business insights" privacy toggle does not appear to reach the server.
7. **MVP (§16).** A small set of hand-verified partner Places in one campus-dense area. Each gets a public Place page, its events and a map pin, a "Here now" check-in that gates a three-question Pulse, and an optional Place Hub. Insights gains a Place tab. Run it for 6–8 weeks, then continue only if consumers return to Place pages *between* events and Pulse reaches its confidence threshold during real busy hours.

---

## 1. What exists today

### 1.1 Inventory of place-like concepts

Click has at least **six** representations of "a physical place." None of them is canonical for consumers.

```
                         ┌───────────────────────────── B2B (manager-only RLS) ───────────────┐
                         │  venues (UUID)  ── venue_managers (owner|manager|viewer)            │
                         │     │  lat/long, free-text location, Stripe status                 │
                         │     ├── nfc_anchors (qr_token, floorplan x/y)                      │
                         │     ├── venue_check_ins (NO WRITERS)                               │
                         │     ├── venue_pop_up_hubs (perks; manager-only)                    │
                         │     ├── venue_metrics_materialized (connections by venue)          │
                         │     └── Insights RPCs: VLC, AMS, ACR, CPR, WRI, PSV, peer %ile     │
                         └──────┬──────────────────────────────────────────────────────────────┘
                                │ map_beacons.venue_id (set only by a venue manager)
                                ▼
   map_beacons (events, soundtracks, alerts …)  ── event_check_ins / beacon_attendees / bookmarks
        │ hub_id ⇄ hub_venues.event_beacon_id        event_engagement_events(venue_id)
        ▼                                            connection_encounters.event_beacon_id
   hub_venues (TEXT id)  ← standalone permanent hubs, any user creates, 50 m geofence, NO venue link
   event_venues_cache    ← OSM grid → venue name (enrichment)
   events_registry       ← venue_name TEXT
   connection_encounters ← location_name / semantic_location (Nominatim) / display_location (city)
   iOS BeaconPlace       ← MKLocalSearch name + address + coordinate, no stable id
```

| Concept | Where | Notes |
|---|---|---|
| `venues` | `supabase/migrations/20260331120000_insights_venues_rbac.sql` | `name`, free-text `location`, `floorplan_svg_url`, Stripe fields and `subscription_status`. `latitude`/`longitude` were added in `20260409120000_vibe_radar_intents_and_beacons.sql`. There is no category, photo, hours, external place id, verification state or public flag. **[EXISTS]** |
| `venue_managers` | same file | Roles are `owner`, `manager` and `viewer`. RLS allows an owner to manage roles. **[REUSE]** |
| `nfc_anchors` | same file | Despite the name, each anchor carries a `qr_token`. These are physical anchors inside a venue. **[REUSE]** as the "QR at the counter" presence proof. |
| `venue_check_ins` | `20260331130000_advanced_metrics_rpc.sql` | Rows are per user with `checked_at`. A `beacon_id` was added in `20260824040000_*`. **Nothing writes it** (no code in `app/` or `lib/` references the table). **[EXTEND]** |
| `venue_pop_up_hubs` | `20260409120000_*` | Manager-created perk windows (`perk_description`, `category_target`, duration). Read in `app/api/insights/beacons/route.ts`. **[EXISTS]**, the seed for offers later. |
| `map_beacons.venue_id` | `20260501000000_map_beacons.sql` | Events link to venues. `POST /api/beacons` only accepts `venue_id` when the caller is a venue manager (`app/api/beacons/route.ts` ~L467–483). **iOS never sends `venue_id`** (no Swift reference), so mobile-created events never attach to a venue. **[EXTEND]** |
| `event_engagement_events` | `20260718140000_event_engagement.sql` | Append-only telemetry with `venue_id`. It is service-role only, and the venue funnel is aggregated in `app/api/insights/[venueId]/event-engagement/route.ts`. **[REUSE]** |
| `event_check_ins` | same | The live presence primitive. The server owns the geofence, checks the live window, stores `checked_out_at` and accuracy, and logs rejects. Radii come from `venue_scale` (`lib/server/eventEngagement.ts`: intimate 75 m, neighborhood 250 m, venue 750 m, campus 2500 m). **[REUSE]** |
| `connection_encounters.event_beacon_id` | `20260718200000_encounter_event_beacon.sql` | A connection is attributed to an event when both parties RSVP'd and connected inside the live geofence. **[REUSE]** |
| `hub_venues` | `20260403100000_ephemeral_community_hub.sql`, `20260511…`, `20260807000000_hub_venues_no_expiry.sql`, `20260831000000_event_auto_hubs.sql` | Standalone hubs are permanent and any user can create one (`app/api/hub/create/route.ts`). Joining checks the geofence (`lib/server/hubGatekeeper.ts`). Event hubs are linked by `event_beacon_id` and excluded from `get_hubs_nearby`. **No `venue_id`.** **[EXTEND]** |
| Recap / network health | `lib/events/eventRecap.ts` (`loadRecapSummary`) and `app/api/beacons/[beaconId]/network-health` | `connections_made`, `repeat_reconnect_count` and `new_pair_count` per event. `GET /api/insights/[venueId]/network-health-trend` rolls this up per venue. **[REUSE]** |
| Attendee directory / mutuals | `lib/events/attendeeDirectory.ts`, `app/api/beacons/[beaconId]/mutual-attendees` | Relationships are classified as self / connection / mutual / stranger. Respects `guest_list_visibility` and `ghost_mode`. **[REUSE]** for the privacy model. |
| Events together | `app/api/users/[userId]/events-together/route.ts` | Shows only events *both* people checked into, never anyone's full attendance. **[REUSE]** as the privacy precedent. |
| Event recommendations | `lib/events/connectionEventRecommendation.ts` | Ranks events using a connection's shared interest tags plus a distance bonus. **[EXTEND]** |
| Drops & recaps | `20261003000000_event_drops_and_history.sql` | Photos keyed by `beacon_id`, revealed the next morning. **[REUSE]** per event. Don't aggregate them to the Place in the MVP. |
| Organizations | `20260824020000_event_series_and_organizations.sql` | `organizations` / `organization_members` and `map_beacons.owner_org_id`. Unused by the app. **[EXISTS]** |
| Unused event shells | `event_participation`, `event_beacon_daily_stats`, `beacon_share_tokens`, `series_id` | See `docs/event-schema-scaling-followups.md`. **[EXISTS]**, unused. |
| Ticketing | `20260919120000_ticketing_foundation.sql`, `lib/server/ticketing/flags.ts` | Off unless `TICKETING_ENABLED=true`. **Not a production dependency for Places.** |
| Presence precedents | `20261002000000_soundtrack_presence.sql`, `20261001000000_alert_confirmations.sql`, `20261005000000_reconnect_nearby.sql` | Soundtrack presence shows a public count, shows names only to connections and has a TTL. Alert confirmations check coordinates and never store them. Reconnect nudges send coarse coordinates on app open, store nothing, and support place mutes keyed to a ~100 m cell. All of these ship dark behind `feature_flags`. **[REUSE]** as patterns. |
| iOS map | `Click/Features/Map/MapFeatureModel.swift`, `ClickMapView.swift`, `Click/Core/Beacons/MapBeacon.swift` (`MapLayer`) | `MapItem.Kind` is beacon, hub, person or hangout. Layers are people, events, hangouts, social, soundtracks, alerts, hubs and other. The map uses `.mapStyle(.standard(pointsOfInterest: .excludingAll))` (`ClickMapView.swift:219`), so **Apple POIs are already hidden on purpose.** |
| iOS place picker | `Click/Features/Events/BeaconForm.swift` (`PlaceSearchModel`, `BeaconPlace`) | `MKLocalSearchCompleter` resolves name, address and coordinate. No stable id is kept. |
| iOS visits | `Click/Core/Location/VisitMonitor.swift` | CLVisit arrivals with opt-in "Always" permission, used only for the reconnect-nearby card. |
| iOS privacy toggle | `Click/Core/Me/MeRepository.swift:505` | `location_include_in_insights_enabled` ("Business insights"). |
| Business onboarding | `app/business/actions.ts`, `app/business/signup/BusinessSignupFlow.tsx` | Takes a name and free-text location, inserts the venue (self-owner), then starts Stripe Checkout with a single `STRIPE_PRICE_ID`. No coordinates, no verification. |
| Insights gate | `lib/server/businessInsightsEligibility.ts` | Access requires one of: the dev allowlist, `users.role = 'verified_business'`, or a manager of a venue whose subscription is `active` or `trialing`. |

### 1.2 What this means

- The **Event → Venue → Insights** spine already works for venues whose managers create events on the web (`/insights/events`). Everything a Place needs for *business* value is mostly built.
- The **consumer** side of a venue does not exist. Under RLS (`venues_select_managers`), only managers can even read a `venues` row.
- The **consumer** side of a persistent place exists as `hub_venues`, but it has no business identity, no verification and no event link apart from per-event auto-hubs.

### 1.3 Gaps to fix before (or regardless of) Places

These are correctness and privacy issues I found while inspecting the code. They block any credible Place launch.

1. **Unverified venue creation.** `venues_insert_authenticated` and `venue_managers_insert_self_owner` (`20260331120000_*` ~L225–268) let any signed-in user create a venue and own it. Harmless while venues are private dashboards. **Dangerous once a venue is a public map pin.**
2. **`venue_check_ins` exposes per-user rows to managers.** The policy `venue_check_ins_select_managers` lets a manager `SELECT` rows that include `user_id`. Nobody writes the table today, so nothing leaks yet. That policy must be removed before Places writes check-ins. Businesses get aggregates only.
3. **Venue connection metrics have almost no input.** `app/api/insights/[venueId]/route.ts` and `venue_metrics_materialized` read `connections.venue_id` / `location_id`. The bind paths (`supabase/functions/bind-proximity-connection/index.ts`, `lib/server/proximity/connectionEnsure.ts`) never set `venue_id`. The fallback is a case-insensitive *name* match between `semantic_location` and `venues.name`, which is fragile. Attribution through events (`connection_encounters.event_beacon_id`) is the path that actually works.
4. **The insights opt-in toggle doesn't appear to reach the server.** Both bind paths hard-code `include_in_business_insights: true`. iOS exposes `location_include_in_insights_enabled`, but I found no server code in click-web that reads it. Before Places widens what flows into business aggregates, the user's choice must be honored at write time, or at least at aggregation time.
5. **"Vibe" means four different things.** Vibe Radar (availability-intent hexbins), `connections.vibe_rating` (1–5), `connection_encounters.vibe_capture` (jsonb) and "social vibe" beacons. Calling the new feature "Vibe Check" would add a fifth meaning. This memo uses **Pulse**.

---

## 2. What exactly is a Click Place?

### 2.1 Definition

> A **Click Place** is the canonical, persistent Click identity of a physical location where people gather on purpose. It is claimed and verified by the people who run it, it is shown to consumers, and every Click-native thing that happens there attaches to it: events, verified encounters, check-ins, Pulse and, optionally, a Place Hub.

Three properties together separate a Place from a POI:

1. **Managed.** It has at least one verified `venue_manager`. Someone accountable can host events and respond to abuse.
2. **Gathering-oriented.** People go there to spend time, often with others. Throughput is not the point.
3. **Click-active.** It has, or credibly will have, Click-native activity (events, check-ins, handshakes). Without that it is just a pin.

### 2.2 Eligibility

| Category | Eligible? | Why |
|---|---|---|
| Cafés, coffee shops | **Yes, core** | Dwell, conversation and repeat visits. A natural Pulse fit (busy / quiet / laptop-friendly). |
| Bars, nightlife, music venues | **Yes, core** | Event-heavy and social by design. "Is it going yet?" is a real question. Needs extra safety review (§11). |
| Restaurants | **Yes, with caveats** | Social, but the visit is mostly planned. Pulse is less useful mid-meal. Groups and events (supper clubs) are the hook. |
| Gyms, climbing gyms, run clubs with a home base | **Yes** | Strong repeat visits and natural "met here" connections. Category-specific Pulse (crowded equipment). |
| Coworking / study spaces / libraries | **Yes, especially on campus** | "Is there room? Is it quiet?" is high-frequency and low-risk. |
| Entertainment venues (bowling, arcades, theaters) | **Yes** | Mostly event-driven. |
| Campus orgs with a *permanent room* | **Yes** | The org owns the Place, and the room is the gathering point. Use `organizations` for ownership [SPECULATIVE]. |
| Large venues (stadiums, arenas, convention centers) | **Limited** | The Place is meaningful as a container for events. Live Pulse is meaningless at 20k people. They need the `campus` venue scale and probably sub-areas (`nfc_anchors`). Not MVP. |
| Retail stores | **Mostly no** | Low dwell and little social gathering. Eligible only when they run events (book shop readings, record store nights). |
| Parks, public squares, trails | **No as a Click Place.** Yes as a **hub or beacon** | Nobody can verify ownership. Keep them as standalone community hubs. |
| Private residences | **Never** | House parties are events with a hidden or approximate location, not Places. |
| Clinics, places of worship, support groups, shelters | **No** | Presence is sensitive information. Never make presence there inferable. Explicitly excluded categories (§11). |
| Schools (K–12) | **No** | Minors and safety. |

### 2.3 Registered only, POIs plus Places, or a hybrid?

| Option | Pros | Cons |
|---|---|---|
| **A. Only registered Places** | The map stays sparse and intentional, fitting today's `pointsOfInterest: .excludingAll`. No moderation of unclaimed listings. Every pin has an accountable owner. | Cold start: almost nothing appears. Users can't say "let's go to X" when X isn't registered. |
| **B. All third-party POIs plus highlighted Places** | Universally useful immediately. | Becomes Google Maps. Unclaimed listings attract activity Click can't moderate, and Click starts competing on data it doesn't own. Licensing and consistency problems with Apple/OSM data. |
| **C. Hybrid (recommended)** | Registered Places are first-class pins. Third-party POIs are not drawn, but stay **addressable**: event creation can pick a POI (as `BeaconForm` already does), and the system remembers the POI's stable id so that a later claim can adopt its history. | Needs a "shadow place" notion (an unclaimed, unlisted key), which adds some complexity. |

**Recommendation: C, done minimally.** Don't render unclaimed POIs. When an event or handshake happens at a POI, store a stable external key. The cheapest version is an Apple `MKMapItem.identifier` or an OSM id on `map_beacons` metadata. When the business claims it later, Click can say "14 Click events have happened here" and attach that history. Unclaimed places get no page, no Pulse and no map pin. This converts organic activity into a sales lead without becoming a directory.

---

## 3. Consumer value

A Place has to answer questions that a consumer *already has*, and answer them better because of Click's verified IRL graph. Ranked by how plausibly they drive repeat opens:

| Question | Can Click answer it uniquely? | Source |
|---|---|---|
| "Is anything happening there tonight?" | Partly. Events are Click-native, but Instagram covers this too. | `map_beacons` with `venue_id`, upcoming |
| "What's it like right now?" | **Only if density exists.** This is the hardest to make honest. | Pulse plus live check-in count, behind thresholds |
| "Where should we go?" (as a group) | **Yes**, if suggestions reflect where *your* network actually spends time | Aggregates of network check-ins and handshakes (§7) |
| "Would this be good for meeting people?" | **Yes, uniquely.** Click can measure new verified connections per visitor-hour. | `connection_encounters` at the Place (handshake source only) |
| "Do people like me go here?" | Yes, through interest-tag overlap of check-ins (aggregated) | `user_interests` × check-ins |
| "Have I been here? Who did I meet here?" | **Yes, and it's private and safe.** It is the user's own data. | Own encounters and check-ins |
| "Is it quiet enough to study or talk?" | Yes, with Pulse | Pulse |

**Useful vs creepy:**

| Useful (ship) | Creepy (don't ship) |
|---|---|
| "Lively right now · 9 Pulse reports in the last hour" | "Sam checked in 12 min ago" (push or feed) |
| "You met Maya and 2 others here" (your own history) | "Maya was here yesterday" |
| "Popular with your Clicks" (k ≥ 5 distinct people, no names, coarse time window) | "3 of your Clicks are here now" by default |
| "Good for meeting people: above average for cafés nearby" | Leaderboards of regulars, "mayor of" titles |
| "Usually busy Fri 9–11pm" | Hour-by-hour histories of a specific person |
| An opt-in "I'm here, come say hi" that the user broadcasts to chosen Clicks (already a beacon/hangout pattern) | Any presence the user didn't explicitly broadcast |

---

## 4. Pulse

### 4.1 Principles

- **Not Yelp.** No stars, no free text, no photos of food, no cumulative "score."
- **Time-indexed.** Every response describes *this place at this time*, and it decays.
- **Presence-gated.** Only people with a recent presence proof can submit.
- **Tiny.** One required tap, two optional.
- **Honest.** Below the sample threshold, show nothing live. Fall back to a labeled historical pattern or to "Not enough Click activity yet."

### 4.2 Questions

**Universal** (always asked; the first is the only required one):

1. **Energy:** `chill · steady · lively · packed` (a single 4-point scale that combines quiet↔lively and empty↔packed; one tap).
2. **Talkability:** "Easy to talk here?" yes / no. *Optional.*
3. **Come back at this time?** yes / no. *Optional, and asked only after leaving.*

**Category-specific** (at most one, replacing #2 when more useful):

| Category | Question |
|---|---|
| Café / study / coworking | "Seats available?" `plenty · some · none` |
| Bar / nightlife | "Line at the door?" `none · short · long` |
| Gym | "Equipment wait?" `none · some · long` |
| Restaurant | "Wait for a table?" `none · short · long` |
| Event at a Place | "Easy to meet people here?" yes / no (feeds "good for meeting people") |

Do **not** ask "good for groups?" directly. Derive it from check-ins that arrive in verified groups (`connections` with more than 2 members, or clique events) and from group dwell. This is exactly the "verified social topology" claim in `PRODUCT.md`.

Version the questions as config in `feature_flags.config`, the same way `alert_confirmations` and `event_drops` keep their numbers in config. Don't create a `pulse_questions` table.

### 4.3 When to ask

```
Arrival ─────────────── During ────────────────── Departure ───────── Next morning
  │ "I'm here" check-in    │ optional in-app        │ check-out            │ event recap
  │ (explicit)             │ Pulse chip on the      │ (explicit, or        │ (existing Drops
  │                        │ Place page             │ server-timed after   │ reveal) can carry
  │                        │                        │ venue TTL)           │ one "would you
  │                        │                        │ → "Come back?" 1 tap │ come back?" card
```

- **During** produces the live signal and the highest-value data. It must be pull-only: a chip on the Place or event page, never a push.
- **On departure / check-out** is the best moment for "come back at this time?"
- **After an event** reuses the recap moment (`/api/me/event-history/recap-card`, `EventRecapView.swift`), which happens anyway.
- **Never** prompt through a background visit (`VisitMonitor`). It would mean background tracking for Places and break §11.

### 4.4 Presence proof and confidence

Each Pulse response stores a **proof type**. The server assigns the weight, never the client.

| Proof | Weight | Exists? |
|---|---|---|
| Scanned the Place's QR anchor (`nfc_anchors.qr_token`; App Clip compatible) within the last 3 h | 1.0 | Anchor exists **[REUSE]**. The scan-to-check-in flow is **[NEW]** |
| Verified handshake encounter inside the Place geofence within the last 3 h | 1.0 | Encounter GPS exists **[REUSE]**. Spatial attribution is **[NEW]** |
| Event check-in at an event with `venue_id = place` (server geofence plus live window) | 0.9 | **[REUSE]** `event_check_ins` |
| Explicit Place check-in with a fresh GPS fix inside the radius and accuracy ≤ 75 m | 0.7 | **[EXTEND]** `venue_check_ins` |
| Place check-in with poor accuracy | 0.3, never counted toward live display alone | — |
| No proof | Rejected | — |

The server checks coordinates against the Place center and radius and does **not** store them on the Pulse row. That is the `alert_confirmations` pattern ("coordinates are checked, never stored").

### 4.5 Decay and display

- **Live window:** responses from the last 90 minutes, exponentially weighted (half-life about 30 min).
- **Live display threshold:** effective weight ≥ 3.0 **and** at least 3 distinct users. Below that, show a historical pattern with a label ("Usually lively Fri 9pm · based on 4 weeks"), and only if *that* reaches its own threshold (≥ 20 responses in the same day-of-week/hour bucket over 8 weeks). Otherwise show "Not enough Click activity yet."
- **Never** show a live count or Pulse with fewer than 3 distinct contributors. That prevents re-identification ("only one person is here and it's lively").

### 4.6 Manipulation resistance

| Threat | Mitigation |
|---|---|
| A business or its staff pump "lively" | Managers' and their invitees' Pulse is excluded for their own Place (a `venue_managers` join). Cap one response per user per Place per 2 h. Weight by account age and handshake count (verified humans). |
| Sybil accounts | Proofs that need a verified handshake or QR anchor carry the most weight. GPS-only proof never reaches the display threshold alone. |
| Competitors spamming "dead" | Presence proof is required. Outlier dampening (median of weighted distribution, not mean). |
| Brigading through a shared link | No Pulse without a check-in. The check-in needs an on-site GPS fix or an anchor scan. |
| Business disputes | Businesses can **report**, not delete. Pulse is not a rating, so there is less to dispute. |

---

## 5. Relationship to events

### 5.1 Structure

```
Place (venues)
  ├── official events     map_beacons.venue_id = place   (created by a manager)       [EXISTS]
  ├── tagged events       map_beacons.metadata.place_ref = place, by any host         [NEW, small]
  │                       (shown on the Place page as "Also happening here"; NOT in Insights)
  └── series              map_beacons.series_id (unused today)                        [SPECULATIVE]
```

**Why two link types.** Today `venue_id` can only be set by managers, and it feeds Insights. That rule is correct. A business shouldn't see analytics for a stranger's meetup, and a stranger shouldn't be able to put events on a business's page as if they were official. But consumers should still be able to plan a book club "at Café X." So:

- `venue_id` (manager-set) means **official**: it appears on the Place page under the Place's name and counts in Insights.
- `place_ref` (host-set from the place picker) means **tagged**: it can appear on the Place page in a separate, moderated section, and it does **not** count in Insights. Managers can hide tagged events from their page.

### 5.2 What stays event-specific vs what rolls up

| Signal | Stays per event | Rolls up to the Place | Rollup form |
|---|---|---|---|
| Impressions / saves / RSVP / shares | ✓ | ✓ | Monthly totals and conversion rates (Insights only) |
| Check-ins | ✓ | ✓ | Visits per day-of-week/hour, unique visitors per month (k-anonymous) |
| Arrival curve, dwell p50/p90 | ✓ | ✓ | Typical dwell by daypart |
| Connections made / new vs repeat pairs | ✓ (`loadRecapSummary`) | ✓ | "New connections per 100 visitors" trend (`network-health-trend` exists) |
| Pulse | ✓ (event-tagged responses) | ✓ | Day-of-week/hour baseline |
| Attendee directory / guest list | ✓ | ✗ | Never roll up identities |
| Drops (photos) | ✓ | ✗ (MVP) | [SPECULATIVE] opt-in "best of" album |
| Event hub chat | ✓ | ✗ | Event hubs stay per event |
| Ticket sales | ✓ (when enabled) | Revenue in Insights only | — |

**What the Place learns over time** is a profile per daypart: typical energy, typical dwell, group share, new-connection rate and repeat-visit rate. It does not learn a list of who attended. That profile is the persistent asset, and only Click can build it.

---

## 6. Relationship to Community Hubs

### 6.1 Today

- **Standalone hubs** (`hub_venues`, `event_beacon_id IS NULL`): permanent, user-created anywhere, joined through a geofence (default 50 m), discovered through `get_hubs_nearby`, shown on the iOS map as `MapItem.Kind.hub`. `PRODUCT.md` says they stay mobile-only.
- **Event hubs** (`event_beacon_id` set): auto-created per event. Access follows RSVP, check-in or host status. Excluded from nearby discovery.

So "venue hubs" already exist conceptually. Someone can make a hub called "Café X," and it will sit on the map next to whatever pin Café X gets as a Place. **That is the duplication to prevent.**

### 6.2 Options

| Option | Verdict |
|---|---|
| Every Place automatically owns a permanent hub | ✗ Empty chat rooms are worse than none. Most cafés don't want to moderate a chat. |
| **Places can optionally enable one Place Hub** | ✓ **Recommended.** The manager toggles it. It reuses `hub_venues` and links through `hub_venues.venue_id` (unique where not null). The Place pin *is* the hub's map surface (the same rule event hubs already follow: excluded from `get_hubs_nearby`). |
| Keep Hubs and Places fully separate | ✗ Leads to two pins and two mental models. |
| Places replace venue hubs | Partly, over time. User-created hubs at a location that later becomes a Place can be *adopted*: the manager is offered "merge the existing community 'Café X regulars' into your Place." |

### 6.3 Consumer UX rule

> **One pin per physical place.** If a Place exists, its hub, its events and its Pulse appear *inside* the Place. Standalone hubs remain for places that aren't businesses: parks, dorm floors, campus quads.

### 6.4 Access to a Place Hub

Reuse the existing gates. Join with a fresh geofence check (`assertHubGeofenceFromCoords`) *or* an active Place/event check-in, the same way event hubs already accept check-ins. Membership persists after leaving, exactly like standalone hubs today. Managers get the moderation role in that hub [EXTEND].

---

## 7. Social-graph integration

### 7.1 Edges

```
Person ─(connection, verified)─ Person            connections, connection_encounters   [EXISTS]
Person ─(RSVP / check-in)────── Event              beacon_attendees, event_check_ins     [EXISTS]
Event  ─(venue_id)───────────── Place              map_beacons.venue_id                 [EXISTS]
Connection ─(event_beacon_id)── Event              connection_encounters                 [EXISTS]
Person ─(check-in / Pulse)───── Place              venue_check_ins, place_pulses        [EXTEND]/[NEW]
Connection ─(encounter in geofence)─ Place         connection_encounters.venue_id       [NEW, derived]
```

The one new graph edge that matters is **Encounter → Place**. It can be computed server-side at encounter write time: a spatial match of the encounter's GPS against Place geofences. This replaces the fragile name match described in §1.3 #3. It is the same pattern as the existing `event_beacon_id` attribution.

### 7.2 Outputs, safest first

| Output | Visible to | Privacy class |
|---|---|---|
| "You've met 3 Clicks here" / "You met Maya here in June" | Only the viewer, from their own encounters | Safe (own data; `reconnect_nearby` already does this) |
| "Places where you tend to meet new people" | Only the viewer | Safe |
| "Popular with your network" (ranked list of Places) | Viewer; aggregated across ≥ 5 distinct connections, counted over ≥ 2 weeks, no names | Acceptable when thresholds are enforced |
| "Good for reconnecting": Places where *existing* pairs repeatedly re-encounter | Aggregate, public | Acceptable |
| "Events at Places your group likes" (for a group chat or clique) | Group members | Acceptable when computed from the group's *shared* encounters only |
| "Maya checks in here often" | — | **Don't build** |
| "2 Clicks here now" | — | Only through explicit opt-in broadcast (the soundtrack-presence model: connections see names only if the person chose to appear) **[SPECULATIVE]** |

### 7.3 Recommendations

Extend `lib/events/connectionEventRecommendation.ts`, which today ranks events by a connection's interests and distance, with a **Place affinity** term. If the viewer and a peer have encountered each other at Place P, or if P is popular within the viewer's network (thresholded), boost events at P. The result is recommendations driven by IRL relationships rather than follower graphs, and it reuses an existing ranker.

---

## 8. Business value

### 8.1 Free vs paid

| Capability | Free (identity) | Paid (Insights) | Notes |
|---|---|---|---|
| Verified profile (name, photo, category, hours, description, directions) | ✓ | | |
| Permanent map pin (subject to the activity rules in §10) | ✓ | | |
| Create official events | ✓ | | Already possible for managers |
| Optional Place Hub | ✓ | | |
| Basic stats: visits this month, events hosted, Pulse summary | ✓ | | Retention hook |
| Event funnel (impression → save → RSVP → check-in), arrival curve, dwell | | ✓ | Exists (`/insights/event-engagement`) |
| Network health (new vs repeat connections, connections per visitor) | | ✓ | Exists per event; trend per venue exists |
| Repeat visitation (cohort return rate, k-anonymous) | | ✓ | New rollup |
| Pulse by daypart, event vs non-event comparison | | ✓ | New |
| Peer percentiles vs similar Places | | ✓ | `insights_peer_percentiles` exists |
| Vibe Radar (intent hexbins near the venue) | | ✓ | Exists |
| Perks / offers | | ✓ [SPECULATIVE] | `venue_pop_up_hubs` exists |
| Ticketing | | Revenue share [SPECULATIVE] | Behind `TICKETING_ENABLED` |

### 8.2 Valuable vs vanity

- **Valuable:** repeat-visit rate, new verified connections per 100 visitors (no one else can measure this), event RSVP → check-in conversion and no-show rate, Pulse by daypart (operational: staffing, music, seating), and event-night vs regular-night comparisons.
- **Vanity:** total impressions, raw check-in counts with no baseline, any "social score" without a peer comparison, heatmaps inside a 30-seat café, and weather resilience (WRI) for most venues.
- **Strategic note:** the existing advanced metrics (VLC, AMS, ACR, CPR, WRI, PSV) are clever but depend on venue-attributed connections, which barely exist today (§1.3 #3). Places' encounter → place attribution is what would make them real. That makes it a strong argument for the architecture, not just the feature.

---

## 9. Registration, claiming and verification

### 9.1 Flow

```
           ┌──────────────┐     search by name/address (Apple Maps / OSM POI)
 Business ─► /business/place├──► existing Place?  ── yes ─► CLAIM ─┐
           └──────────────┘         │ no                           │
                                    ▼                              ▼
                              CREATE (draft, unlisted)      VERIFY (one of):
                                    │                        • postcard / letter code to the address
                                    └──────────────►         • phone call to the listed number
                                                             • domain email matching the website
                                                             • in-person: scan a Click-issued QR at the counter
                                                             • manual admin (pilot partners)
                                                                    │
                                                                    ▼
                                                    status = verified → may be listed
                                                    (listed on the map once §10 activity rules pass)
```

### 9.2 Rules

- **Create vs claim.** Each Place stores `external_place_ref` (Apple `MKMapItem.identifier` or an OSM id) and a canonical coordinate. Creation checks for an existing ref or any Place within 40 m with a similar name. A match turns the flow into a claim.
- **Draft until verified.** Unverified venues stay exactly what venues are today: private dashboards. This keeps the existing `/business/signup` flow working and closes gap #1.
- **Multiple managers.** Already supported (`venue_managers` roles). Add an invite flow, since today only an owner can insert.
- **Multiple locations.** One business with N locations means N Places plus an optional `organizations` row as the parent (the table exists and is unused). Billing per location or per org is a pricing decision. The schema can support both.
- **Duplicates.** Admin merge tool. The merge rewrites `map_beacons.venue_id`, `hub_venues.venue_id` and check-ins and Pulse to the survivor, and keeps a redirect id.
- **Ownership changes.** Owner transfer, plus an admin "reclaim" path that requires re-verification. Ownership change must not carry over historical Insights for a different operator without an explicit decision (it's the same Place, but a new business).
- **Abuse and moderation.** Report a Place (reuse the `beacon_reports` / `drop_reports` patterns). Excluded categories (§2.2) are blocked at creation. Delisting is an admin action. Pulse can't be deleted by managers.
- **Subscriptions.** The Stripe subscription stays on `venues` (as today). Verification is independent of payment. Free Places must not need Checkout. Today's `/business/signup` goes straight to Checkout; that would change.

---

## 10. Map and discovery

### 10.1 Placement in the current map

iOS already has a layered map with Apple POIs excluded (`ClickMapView.swift:219`). Places would add a fifth `MapItem.Kind` (`.place`) and a `MapLayer.places`.

### 10.2 Visibility rules (avoiding Google Maps)

A verified Place gets a **full pin** only when it is **active**, meaning at least one of:

- an official event live now or starting within 24 h,
- a live Pulse above the display threshold,
- Place Hub activity in the last 24 h,
- the viewer has personal history there (own encounters or check-ins),
- network popularity above the threshold.

Otherwise it gets a **quiet pin**: a small dot, hidden below a zoom level, never clustered with active items. At most N full Place pins per viewport, ranked by activity and graph relevance.

### 10.3 Visual language

| Item | Look |
|---|---|
| Event (temporary) | Existing event card/pin, with a time badge |
| Beacon (temporary signal) | Existing beacon styles |
| Standalone hub | Existing hub pin |
| **Place (persistent)** | Distinct shape (rounded square vs round beacon), the business photo or category glyph, and an energy ring that appears only when live Pulse passes the threshold |
| Event *at* a Place | **Merged into the Place pin** as a badge ("Tonight 8pm"), not a second pin. Removes today's potential duplication. |

### 10.4 Discovery surfaces

- The `NearbySheet` gets a "Places" section, ordered by activity, below live events.
- Place cards in Home: only the **own-history** card ("Back at Café X — you met Maya here", already the `ReconnectNearbyCard` pattern) and an occasional "Where your network goes" card. No infinite Place feed (`PRODUCT.md` principle 1).

---

## 11. Privacy (first-class constraint)

### 11.1 Rules

1. **Businesses only receive aggregates.** k ≥ 5 distinct people per reported cell. Time buckets of at least one hour for live data and at least one day for history. No per-user rows through RLS or API. Drop `venue_check_ins_select_managers` first.
2. **No background tracking for Places.** Presence comes only from foreground, explicit actions: Place check-in, event check-in, QR scan, or a handshake that already happens. `VisitMonitor` stays scoped to reconnect nudges.
3. **Raw presence rows are short-lived.** `venue_check_ins` and `place_pulses` user-level rows are kept for at most 30 days (needed for de-duplication, abuse handling and the user's own history), then rolled up and the `user_id` is nulled or the row deleted. This is cron-backed, like `cron-hourly-maintenance` already purging soundtrack presence.
4. **Coordinates are checked, not stored**, for Place check-in and Pulse. Store the distance bucket and accuracy bucket, not lat/long. (Event check-ins currently *do* store lat/long; leave that unchanged in the MVP but note it.)
5. **Honor the opt-out.** `location_include_in_insights_enabled = false` must exclude the user from every business-facing aggregate. Consumer aggregates such as Pulse need a separate decision: Pulse is explicit, so contributing is consent; network-popularity counts should respect a "don't count me in network stats" toggle.
6. **Ghost mode wins everywhere.** Ghosted users never appear in counts that their connections can see (soundtrack presence already does this).
7. **Sensitive categories are excluded** from Place eligibility entirely (§2.2).
8. **No "friend is here now"** without an explicit, time-boxed broadcast by that friend.
9. **Small-place re-identification.** In a 20-seat café at 8am, even "2 people here" can identify someone. Thresholds apply to every surface, including the business dashboard and live counts.

### 11.2 Data minimization by surface

| Surface | Sees |
|---|---|
| Public Place page (web, anonymous) | Profile, upcoming official events, Pulse *pattern* (not live), no counts below k |
| Signed-in consumer | Plus live Pulse (thresholded), own history, network popularity (thresholded, no names) |
| Place manager (free) | Monthly visits, events hosted, Pulse summary, all thresholded |
| Place manager (Insights) | Funnels, dwell, cohorts and network health, all aggregated (existing pattern) |
| Click admin | Abuse queues; no casual access to user-level presence |

---

## 12. Monetization

Make the Place tier the **free tier of the existing Business Insights product**, not a new SKU:

```
Click Place (free)                         Click for Business / Insights (existing Stripe sub)
- verified profile + map presence          - everything in free, plus
- official events, Place Hub               - event engagement (exists)
- basic monthly stats (thresholded)        - network health trend (exists)
- Pulse summary                            - repeat-visit cohorts, daypart Pulse (new)
                                           - peer percentiles, Vibe Radar (exist)
                                           - multi-location rollups via organizations [SPECULATIVE]
                                           - perks / pop-ups (venue_pop_up_hubs) [SPECULATIVE]
```

Mechanically this needs very little: `subscription_status` is already on `venues`. `userMayAccessBusinessInsights` keeps gating the paid routes. A new, lighter gate (`userManagesVerifiedPlace`) covers free manager surfaces. `/business/signup` becomes "claim your Place → (optional) upgrade."

Don't charge for map visibility or ranking. Pay-to-be-visible would destroy consumer trust in Pulse and in "popular with your network."

---

## 13. Cold start

Places will be empty almost everywhere for a long time. Design for that and **say so in the UI**.

1. **Concentrate.** Launch in one campus area (the brand says "built at UW"), with 10–20 hand-verified partner Places within walking distance of each other.
2. **Lead with events.** Events create density on a schedule. The first Pulse data should come from event check-ins at partner Places, which is where enough people overlap to pass the thresholds.
3. **Thresholds first, UI second.** Live Pulse appears only above threshold. Historical patterns appear only above their own threshold. Otherwise show "Not enough Click activity yet," and never invent a baseline from the category.
4. **Category baselines are for businesses, not consumers.** "Cafés on campus average X" can appear in Insights peer comparisons (as `insights_peer_percentiles` does). It must not appear on a consumer Place page as if it described *this* place.
5. **Own-history value works at n = 1.** "You met Maya here" works from the first handshake. That is the only consumer value guaranteed in a sparse network, so lead with it.
6. **Adopt organic history on claim.** Using the `external_place_ref` stored on events and encounters (§2.3), a newly claimed Place starts with "23 Click events and 140 verified connections have happened here." That is both a sales hook and a non-empty page.

---

## 14. Architecture mapping

### 14.1 Reusable as-is [REUSE]

`venue_managers`, `nfc_anchors` (QR tokens), `event_check_ins` + the check-in route + `venue_scale` radii, `event_engagement_events` (venue-keyed), `loadRecapSummary` / network-health / network-health-trend, `attendeeDirectory` relationship classification, `events-together`, `feature_flags` (ship dark), `hubGatekeeper` and the hub routes, `insights_peer_percentiles`, the Stripe webhook → `venues.subscription_status`, the iOS `PlaceSearchModel`, `MapFeatureModel` layering, `ReconnectNearbyCard`, `EventRecapView`.

### 14.2 Extend (minimal additive changes) [EXTEND]

| Object | Additions | Why |
|---|---|---|
| `venues` | `slug`, `category` (enum), `description`, `photo_path`, `hours` (jsonb), `address` (structured), `external_place_ref` (+ provider), `radius_meters`, `venue_scale`, `verification_status` (`draft` · `pending` · `verified` · `suspended`), `verified_at`, `listed` (bool), `hub_enabled`, and an `location geography` generated column (as `hub_venues` has) | Consumer profile, geofence, verification, listing. Lat/long already exist. |
| `venues` RLS | Add `SELECT` for `anon`/`authenticated` **through a view or RPC** that exposes only public columns where `verification_status = 'verified' AND listed`. Keep the base table manager-only (Stripe ids must never leak). Tighten insert: new rows are forced to `draft`. | Public pages without exposing billing |
| `venue_check_ins` | `checked_out_at`, `source` (`gps` · `anchor` · `event` · `encounter`), `accuracy_bucket`, `distance_bucket`, `platform`, `app_version`, an expiry/purge column. **Drop** the manager per-row `SELECT` policy. Own-row select for users. Service-role writes through an API. | Place presence |
| `hub_venues` | `venue_id uuid NULL REFERENCES venues ON DELETE SET NULL` + unique partial index; `get_hubs_nearby` excludes rows with `venue_id` set (the Place pin is the surface, as with event hubs) | One Place Hub per Place |
| `map_beacons` | Keep `venue_id` (official). Add `metadata.place_ref` (the tagged place's id) and `metadata.external_place_ref` (POI key from the picker). No column needed in the MVP. | Tagged events; claim adoption |
| `connection_encounters` | `venue_id uuid NULL`, set server-side by spatial match at write time (inside the same functions that set `event_beacon_id`) | Reliable Place attribution for connections; fixes §1.3 #3 |
| `connections` write path | Honor `location_include_in_insights_enabled` instead of hard-coding `include_in_business_insights: true` | Privacy (§1.3 #4) |
| `connectionEventRecommendation.ts` | Place-affinity term | Graph-based recommendations |
| `organizations` | Optional `venues.org_id` for multi-location businesses | [SPECULATIVE] |

### 14.3 Genuinely new [NEW]

Keep this list short:

| Entity | Shape (sketch) | Notes |
|---|---|---|
| `place_pulses` | `id`, `venue_id`, `beacon_id NULL`, `user_id` (nulled after 30 d), `proof` enum, `weight` real, `energy` smallint, `talkable` bool NULL, `category_answer` text NULL, `would_return` bool NULL, `question_version`, `created_at` | One table. Questions live in config, so no prompts/responses split is needed. |
| `place_daily_stats` | `venue_id`, `day`, `hour`, `visits`, `unique_visitors` (only when ≥ k), `pulse_energy_hist` jsonb, `new_connections`, `repeat_connections`, `group_arrivals` | Rollup that feeds the history and Insights. Follows the `event_beacon_daily_stats` shell pattern, which is also unused today. |
| `place_claims` | `id`, `venue_id`, `user_id`, `method`, `status`, `evidence` (no PII beyond needed), timestamps | Verification workflow |

That's it. **No `place_visits` table.** Visits are `venue_check_ins` plus derived event check-ins plus encounter attribution, unioned in the rollup. A separate visit table would invite continuous-tracking semantics.

### 14.4 API sketch (click-web BFF)

```
Public / consumer
  GET  /api/places/nearby?lat&lng&radius           active + quiet Place pins (thresholded fields)
  GET  /api/places/{slug|id}                       profile, upcoming events, Pulse (live|pattern|none),
                                                   viewer-only: own history, network popularity
  POST /api/places/{id}/check-in                   { lat, lng, accuracy } | { anchor_token } → proof
  POST /api/places/{id}/check-out
  POST /api/places/{id}/pulse                      requires a valid proof within the window
  GET  /api/places/{id}/events                     official + tagged (separate arrays)
  GET  /api/me/places                              own history (private)

Manager
  POST /api/places                                 create draft (replaces createVenueForCheckout's insert)
  POST /api/places/{id}/claims                     start verification
  PATCH /api/places/{id}                           profile, hours, hub_enabled, listed
  POST /api/places/{id}/managers                   invite
  GET  /api/places/{id}/stats                      free, thresholded summary

Insights (existing gate)
  GET  /api/insights/{venueId}/place               daypart Pulse, repeat cohorts, visits trend
  (existing) /api/insights/{venueId}/event-engagement, /network-health-trend, /advanced-metrics

Existing routes extended
  POST /api/beacons                                accepts place_ref (any host) / venue_id (managers, unchanged)
  POST /api/hub/create                             refuses inside a verified Place's radius → suggest the Place Hub
  GET  /api/map/beacons                            merges Place pins or returns them alongside (one round trip)
```

Keep `/api/insights/[venueId]` as the paid surface. **`venueId` is the Place id.** No renaming in the database; use "Place" only in product copy.

### 14.5 iOS implications (`click-ios`)

| Surface | Change |
|---|---|
| **Map** (`MapFeatureModel.swift`, `ClickMapView.swift`, `MapBeacon.swift`) | Add `MapItem.Kind.place` and `MapLayer.places`. Events with `venue_id` collapse into the Place pin as a badge. Quiet vs full pin rules come from the server. |
| **Place detail** (new `Click/Features/Places/PlaceDetailView.swift`) | Header (photo, category, hours, directions), Now (Pulse or honest empty state), Upcoming (official events, then tagged), Your history (own), Place Hub entry, "I'm here" button. Model it on `BeaconDetailView` sections. |
| **Check-in** | Reuse the `EventEngagementRepository.checkIn` pattern: a one-shot location for this action only (the comment at `BeaconDetailView.swift:757`, "the server owns the geofence"). Add QR anchor scan, and through the App Clip, which already handles `venue_id` QR aliases (`AppRouter.swift` ~L459). |
| **Pulse** | A small sheet with 1–3 chips, from the Place detail and after check-out. Nothing pushed. |
| **Event detail** | "At *Café X*" becomes a tappable Place link when `venue_id` or `place_ref` is set. |
| **Event create** (`BeaconForm.swift`) | `PlaceSearchModel` resolves to a Click Place first ("Click Place ✓"), falling back to the POI. It sends `place_ref` and `external_place_ref`. |
| **Home** | Extend `ReconnectNearbyCard` copy to name the Place when the encounter is Place-attributed. No new feed. |
| **History / profile** | `FriendshipStats.spots` gains the Place name and link when available. The "Places we've been" list stays private to the pair (events-together precedent). |
| **Nearby sheet** | A "Places" section. |
| **Settings** | Make sure the "Business insights" toggle actually reaches the server (§1.3 #4). |

### 14.6 Web implications (`click-web`)

| Surface | Change |
|---|---|
| **Public Place page** `/p/{slug}` | Yes, warranted for SEO and link sharing (as `/e/{id}` is). Profile, upcoming official events (linking to `/e/{id}`), Pulse *pattern* only (no live data for anonymous viewers), a "Get Click" CTA. SSR, like `/events`. |
| **Business onboarding** `/business` | Replace "name + free-text location → Checkout" with "find your place → claim/create → verify → (optional) upgrade". Reuse `BusinessSignupFlow.tsx` steps. |
| **Manager interface** | A "Place" tab inside `BusinessInsightsShell` (profile, hours, managers, hub toggle, tagged-event moderation, free stats). Free managers see only this tab. Paid managers see everything. |
| **Insights** | A "Place" page with daypart Pulse, visit trend and repeat cohorts. Existing event engagement and network health are unchanged, just labeled under the Place. |
| **Events** | `/insights/events` already creates venue events, so keep it. `/e/{id}` shows a "Hosted at" Place link. |
| **Admin** `(admin)` | Claims queue, merges, delisting, category exclusions. |

---

## 15. Challenging the concept

### 15.1 How this becomes an unfocused Yelp clone

- Adding free-text reviews "because users asked."
- Adding star ratings, "top 10 cafés" lists and photo galleries of the menu.
- Rendering unclaimed POIs to make the map look full.
- Optimizing for Place page time-on-screen.

**Guardrail:** every Place feature must use a signal that only Click has (verified presence, verified connections, events or the user's own graph), or it doesn't ship.

### 15.2 Why consumers might not care

- They already know their regular spots. Pulse adds little where they go anyway.
- Live Pulse will be empty most of the time outside events, and an empty state shown often teaches people not to look.
- "Where should we go?" is usually settled in a group chat, so the decision surface is the chat, not the map. *Implication:* sharing a Place card into a chat (like event cards) may matter more than the Place page itself.
- Checking in is a chore unless it unlocks something (Pulse visibility, the hub, an event). Foursquare-style check-in fatigue is a known failure.

### 15.3 Why businesses might not care

- Their customers aren't on Click yet. A dashboard of zeros is a churn engine.
- They already have Google Business Profile, Instagram and Resy/Toast data.
- Verification friction for a small owner is real.
- "Social topology" is an abstract value proposition. Owners care about covers, revenue and repeat customers. *Implication:* lead with repeat-visit rate and event check-in conversion, not CPR/VLC.

### 15.4 Density and network effects

Every Place-level signal needs several Click users at the same place at the same time. Outside events, that is rare for a long time. A Place can only bootstrap from event check-ins and handshakes, which means **Places depend on Events working first.**

### 15.5 Privacy risks

- Small venues make aggregates identifying.
- Network-popularity features can leak a single friend's habits when the network is small (hence k ≥ 5 *connections*, not just visitors).
- Businesses will ask for "who are my regulars." The answer must be structurally impossible, not just a policy.
- Nightlife plus location plus a social graph is a stalking and safety risk.

### 15.6 Overlap with existing features

| Existing | Overlap | Resolution |
|---|---|---|
| Community Hubs | Persistent place-scoped community | Place owns at most one hub (§6) |
| Events | Place page is mostly "events here" | Places are containers. Events stay the primary unit of activity. |
| Vibe Radar | "What's the vibe near this venue" | Radar shows *intent* (who wants to do what nearby). Pulse shows *observed state at a place*. Both stay B2B-side or consumer-side respectively. Don't add Radar to consumer pages. |
| Venue Insights | Same entity | Same table; Places is the free consumer-facing face |
| Soundtrack / social beacons | Temporary place signals | Unchanged; they can sit inside a Place's radius |
| Reconnect nearby | "You met X here" | Becomes Place-aware; no duplication |

### 15.7 Attractive but probably not worth building

- Leaderboards, "regulars" badges, mayorships.
- Live "who's here" lists.
- Free-text reviews or photo uploads to Places.
- Background auto check-in through visits or geofence monitoring.
- Category baselines presented to consumers as "this place's vibe."
- Paid placement on the map.
- Unclaimed POI pages.
- Floorplan/zone heatmaps inside small venues (`floorplan_svg_url` and `nfc_anchors` x/y already exist; leave them to large venues).
- Ticketing-driven Place features until ticketing is production-enabled.

### 15.8 Assumptions to test before substantial engineering

1. **Do consumers open a Place page between events?** Test with a web-only `/p/{slug}` for 5 partner Places, using existing events data and no new backend tables.
2. **Will people check in without an event reason?** Test with a QR card at the counter that opens the App Clip / a page, measuring scan rate per 100 visitors.
3. **Does Pulse reach the threshold during busy hours at partner Places?** If not at the 20 densest campus spots, it won't anywhere.
4. **Will owners verify and keep a profile current without paying?** Watch profile edits per month and event creation rate.
5. **Does Place affinity improve event recommendations?** Measure RSVP rate on recommendations with and without the affinity term, offline first, using existing encounter and event data.

---

## 16. MVP: the smallest real test

### 16.1 What ships

- **10–20 hand-verified partner Places** in one campus area, created by admin (no self-serve claiming yet).
- A **Place page** in iOS and on the public web `/p/{slug}`: profile, official events, honest "Now" state, own history (iOS, signed in).
- **Place pins on the iOS map** (a new kind and layer). Events at a Place merge into its pin.
- **"I'm here" check-in**, by GPS one-shot or QR anchor. The QR anchor is the main path.
- **Pulse v1**: one required question (energy), one optional category question, and "come back?" at check-out. Live display only above the threshold.
- **Optional Place Hub**, admin-enabled per partner and linked through `hub_venues.venue_id`.
- **Insights "Place" tab** for partner managers: visits trend, daypart Pulse and the existing event engagement and network health, all thresholded.
- **Encounter → Place attribution** server-side (spatial match), so "you met X here" and network-health-at-Place work.
- Everything behind a `places` feature flag (the existing `feature_flags` pattern, shipping dark).

### 16.2 What deliberately does not ship

Self-serve create/claim/verify flows · unclaimed POIs · tagged (non-official) events · network popularity ("popular with your Clicks") · recommendations changes · perks/offers · ticketing · multi-location/orgs · large-venue zones · drops aggregation · any background location · free-text feedback · public live Pulse for anonymous web viewers.

### 16.3 Reused infrastructure

`venues`, `venue_managers`, `nfc_anchors` (QR), `map_beacons.venue_id`, `event_check_ins`, `event_engagement_events`, `loadRecapSummary` / network-health-trend, `hub_venues` + `hubGatekeeper` + hub routes, `feature_flags`, the Insights shell and gate, the `ReconnectNearbyCard` pattern, the App Clip QR routing, `PlaceSearchModel`.

### 16.4 Minimum new backend concepts

1. Additive `venues` columns (category, photo, hours, slug, radius, verification_status, listed) plus a public view/RPC.
2. `venue_check_ins` hardened (drop the manager SELECT policy, add source/check-out/purge) and written by `POST /api/places/{id}/check-in`.
3. `place_pulses` (one table) plus a thresholded read RPC.
4. `hub_venues.venue_id` (nullable, unique).
5. `connection_encounters.venue_id`, set by spatial match at encounter write.
6. Prerequisite fixes: venue insert forced to `draft`, and the insights opt-out honored at write time.

`place_daily_stats` can wait. For 20 Places, on-read aggregation with thresholds is fine.

### 16.5 Minimum iOS surfaces

Map pin plus layer · `PlaceDetailView` · check-in (GPS + QR) · Pulse sheet · a Place link from event detail · Place-aware reconnect copy.

### 16.6 Minimum web and business surfaces

`/p/{slug}` public page · "Place" tab in the Insights shell (profile edit + thresholded stats) · an admin page to create/verify Places and toggle the hub.

### 16.7 Continue-or-stop metrics (6–8 weeks)

| Metric | Why | Continue if (initial guesses, to be calibrated) |
|---|---|---|
| **Place page repeat opens on non-event days** per weekly active user | The core consumer hypothesis | A meaningful share of WAU in the pilot area open ≥ 1 Place page on a non-event day, week over week, without push |
| **Check-ins per 100 estimated visitors** (partner-reported covers) at partner Places | Whether presence capture is viable without an event | Rising, not decaying after the novelty weeks |
| **Hours with live Pulse above threshold** / busy hours | Whether the density premise holds | Pulse is live for a majority of partners' peak hours |
| **Pulse completion rate** after check-in | Friction | High enough that thresholds are met mainly by organic responses |
| **Event RSVP→check-in at Places vs non-Place events** | Whether Places make events better | Not worse, ideally better |
| **New verified connections per 100 check-ins** at Places | The unique business claim | Stable or rising; this is the number to show owners |
| **Manager weekly active rate** on the Place tab | Business pull | Most partners open it weekly without prompting |
| **Partner willingness to pay** (stated, then a trial) | Monetization | A meaningful share request Insights at pilot end |
| **Privacy incidents / complaints** | Guardrail | Zero re-identification reports; fix immediately otherwise |

**Kill or reshape signals:** Place pages opened only from event links (meaning Places add nothing beyond events), Pulse below threshold in most peak hours, or managers not returning after week 2. If those appear, fold the useful pieces back in: Place-aware encounter attribution, a "Hosted at" link and the Place Hub. Drop the rest.

---

## 17. Open questions

1. Should check-in for Pulse expire on departure only (explicit check-out), or on a server TTL per `venue_scale` (as event check-ins rely on the event window)?
2. Should Place Hub access persist forever after one verified visit (like standalone hubs), or lapse after inactivity?
3. Who owns a campus room Place: the org (`organizations`) or a person (`venue_managers`)? It probably means linking `venue_managers` to org membership.
4. Should a Place change its `radius_meters` after verification? Changes alter historical aggregates.
5. Pricing per Place vs per organization.
6. Does the Android/KMP client (`click`) need Places at the same time, or does iOS lead? `AGENTS.md` notes that click-web's `supabase/` is canonical and mobile mirrors a subset.
