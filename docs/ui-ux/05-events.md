# Events (web)

Event beacons are `map_beacons` rows with `beacon_type = 'event'`. There is no separate event entity and no vanity slug. The share URL is always `/e/{beaconId}`.

## Create (auth)

Shared form: [`components/events/EventCreateForm.tsx`](../../components/events/EventCreateForm.tsx) → `POST /api/beacons` with `kind: "event"`. Cover upload uses `POST /api/beacons/image`. Location is a place search (plus “Use my location”), not raw latitude/longitude fields. Lat/lng are still submitted with the beacon.

| Surface | Route |
|---------|--------|
| Anyone signed in | `/events/new` (login modal if logged out) |
| Personal dashboard | Events tab on `/` — My events, RSVPs, Create event |
| Venue manager | Insights **Events** tab (`/insights/events?venue_id=`) — same form, sends `venue_id`. Do **not** use Vibe Radar `BeaconDeployModal` (soundtrack / pop-up hub pin). |

Success navigates to `/e/{id}` and the form can copy that link.

## View (logged-out OK)

| Route | Who | Notes |
|-------|-----|--------|
| `/events` | Public | Dense date-rail list (`max-w-4xl`, `space-y-3`) of upcoming events with `visibility_audience = 'everyone'` only. Each [`EventListCard`](../../components/events/EventListCard.tsx) shows month/day, title, 2-line description, host (when `show_creator_name`), when, location, RSVP count, and a square thumb. |
| `/e/[beaconId]` | Public share link | Cover, when/where, description, host, guest RSVP, Open in Click. Connections-only events stay reachable via this URL. |
| `/e/[beaconId]/manage` | Creator or venue manager | Guest list + network-health metrics |
| `/e/[beaconId]/recap` | Participant (Click RSVP or check-in) | People met at this beacon |
| `/e/[beaconId]/summary?token=` | Public snapshot | Aggregate counts only, after organizer publish |

Light/dark: semantic tokens (`bg-background`, `bg-surface`, `text-on-surface`, `border-border-hard`) and `components/fc/` only. The old hardcoded `zinc-950` share card is gone. Navbar `ThemeToggle` applies.

Guest RSVP is name + email or phone. It writes `event_guest_rsvps`, never `beacon_attendees`. Guests never appear in mutual teasers or recap.

## Mutual connections teaser

Shown only when the visitor has a Click session **and** `GET /api/beacons/{id}/mutual-attendees` returns `count > 0`. One-way, connections only. Users with `users.ghost_mode` are excluded from others' overlap.

## Organizer auth

`userMayManageBeacon`: `map_beacons.creator_id` **or** a `venue_managers` row for `map_beacons.venue_id`. RSO creators use `/e/{id}/manage`, not `/insights` (subscription-gated).

## APIs

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/beacons/public-events` | none |
| GET | `/api/beacons/{id}/public` | none |
| POST | `/api/beacons/{id}/rsvp/guest` | none, rate-limited |
| GET | `/api/beacons/{id}/rsvp/guests` | organizer |
| GET/POST | `/api/beacons` | session (create event + map fetch) |
| GET | `/api/beacons/mine` | session |
| GET | `/api/beacons/{id}/mutual-attendees` | session |
| GET | `/api/beacons/{id}/recap` | participant |
| GET | `/api/beacons/{id}/recap-summary` | organizer |
| GET | `/api/beacons/{id}/network-health` | organizer |
| POST | `/api/beacons/{id}/summary/publish` | organizer |
| GET | `/api/beacons/{id}/summary?token=` | none |
| PATCH | `/api/user/ghost-mode` | session |
| GET | `/api/insights/{venueId}/events` | venue manager |
| GET | `/api/insights/{venueId}/network-health-trend` | venue manager |

Recap and network-health both call [`lib/events/eventRecap.ts`](../../lib/events/eventRecap.ts) and count unique `connection_id` values on `connection_encounters.event_beacon_id`.

## Schema (additive)

Postgres now has first-class `map_beacons.starts_at` / `ends_at` / `event_timezone`, a Click-account `event_participation` table, optional `series_id` / `owner_org_id`, and unused funnel tables (`beacon_share_tokens`, `event_beacon_daily_stats`). **The app does not read or write them yet.** Create still sends `metadata.event_start_at` / `event_end_at` only. Guests still write `event_guest_rsvps`. Organizer auth is still `creator_id` or `venue_managers`, not `owner_org_id`. See [`event-schema-scaling-followups.md`](../event-schema-scaling-followups.md).
