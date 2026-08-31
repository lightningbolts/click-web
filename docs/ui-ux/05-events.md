# Events (web)

Event beacons are `map_beacons` rows with `beacon_type = 'event'`. There is no separate event entity and no vanity slug. The share URL is always `/e/{beaconId}`.

## Create (auth)

Shared form: [`components/events/EventCreateForm.tsx`](../../components/events/EventCreateForm.tsx) → `POST /api/beacons` with `kind: "event"`. Cover upload uses `POST /api/beacons/image`. Location is a place search (plus an icon-button “Use my location” that reverse-geocodes a label), not raw latitude/longitude fields. Lat/lng are still submitted with the beacon. Create also writes listing columns (`event_visibility`, `event_capacity`, `approval_required`, `guest_list_visibility`, `cover_theme_id`) and dual-writes `starts_at` / `ends_at` / `event_timezone` beside metadata.

| Surface | Route |
|---------|--------|
| Anyone signed in | `/events/new` (login modal if logged out) |
| Personal dashboard | Navbar **Events** → `/events` — My events, RSVPs, Create event, then public Discover |
| Venue manager | Insights **Events** tab (`/insights/events?venue_id=`) — same form, sends `venue_id`. Do **not** use Vibe Radar `BeaconDeployModal` (soundtrack / pop-up hub pin). |

Success navigates to `/e/{id}/manage` so the organizer can Seed a Room (guest-list upload) immediately. The public share URL remains `/e/{id}`.

## View (logged-out OK)

| Route | Who | Notes |
|-------|-----|--------|
| `/events` | Public + signed-in | Shared `EventPageShell` (`max-w-6xl`) and the same horizontal Navbar as the rest of the site. Signed-in visitors see **Your events** (`DashboardEventsModule`) then **Discover** (public list). Anonymous visitors see the public list only. Search + date/going/host chips, featured soonest event, then Today / This week / Upcoming. Cards use `CardVisualHero` (no date-rail). Route navigations show [`EventRouteLoading`](../../components/events/EventRouteLoading.tsx) skeletons (`app/events/loading.tsx`, `app/e/[beaconId]/loading.tsx`, `app/events/new/loading.tsx`); the ready page fades in via `EventPageEnter`. Hosted cards: top-right icon actions for Edit / Host settings. Only `event_visibility = public` **and** `visibility_audience = everyone`. Unlisted / invite-only stay off this feed. |
| `/events/new` | Signed in | Same 6xl shell and global Navbar. Split-pane create form (cover + theme \| details + Event options). |
| `/e/[beaconId]` | Public share link | Same 6xl shell. Cover (upload or generated visual), when **with timezone**, where (omitted if unnamed), muted posted time, host avatar, description (`max-w-prose`), MapLibre pin, RSVP states (going / pending / full / ended). Signed-in RSVP mutates `GET /api/beacons/{id}/rsvp` (attendees + `rsvp_count`) so the guest preview updates without a reload. Hosts see **Edit details** / **Host settings** in the toolbar next to Back, not under the banner. One action row: **Open in Click** + copy-link icon (both `h-11`), then **Get the app** / **Android** as secondary `FcButton`s. Back always returns to `/events` unless an explicit `href` is passed (manage/edit go back to `/e/{id}`). Connections-only and unlisted/invite-only events stay reachable via this URL. |
| `/e/[beaconId]/manage` | Creator or venue manager | **Back** to the event page, Seed a Room (CSV/paste emails), guest RSVPs, pending/waitlisted Click RSVP approve/deny, network-health metrics, **Edit details** |
| `/e/[beaconId]/edit` | Creator or venue manager | **Back** to the event page, same `EventCreateForm` as create, `PATCH /api/beacons/{id}`. Hosted list cards and the event toolbar expose **Edit details** and **Host settings**. |
| `/e/[beaconId]/recap` | Participant (Click RSVP or check-in) | People met at this beacon |
| `/e/[beaconId]/summary?token=` | Public snapshot | Aggregate counts only, after organizer publish |

Light/dark: semantic tokens (`bg-background`, `bg-surface`, `text-on-surface`, `border-border-hard`) and `components/fc/` only. The old hardcoded `zinc-950` share card is gone. Navbar `ThemeToggle` applies.

Guest RSVP is name + email or phone. It writes `event_guest_rsvps`, never `beacon_attendees`. Guests never appear in mutual teasers or recap.

## Mutual connections teaser

Shown only when the visitor has a Click session **and** `GET /api/beacons/{id}/mutual-attendees` returns `count > 0`. One-way, connections only. Users with `users.ghost_mode` are excluded from others' overlap.

## Seed a Room (anonymized teasers)

Organizers upload emails on `/e/{id}/manage` (`POST /api/beacons/{id}/guest-list`). Matching is SHA-256 email vs `user_contact_hashes` only — Instagram handles may be stored but are not matched. Matched Click users get one anonymized count teaser (`GET /api/me/event-bookmarks/{id}/teaser`): `"3 people going who share an interest"`. Payloads never include names unless `teaser_type = mutual_connection_count` and both sides already have an active connection (current generator still stores counts only). Ghost-mode users are excluded from others' counts. This is separate from unauthenticated `event_guest_rsvps`.

Hourly event-reminders cron also sends `event_teaser` pushes 24–48h before `metadata.event_start_at` when the recipient pref `event_teaser_push_enabled` is on.

## Encounter-triggered nudges

Hourly `GET /api/cron/nudges-reconnect` writes inbox rows for handshake connections with a 21-day chat lull after the last BLE encounter (14-day send cooldown). RSVP/bookmark overlap creates `shared_upcoming_event` nudges (`GET /api/me/nudges`, dismiss/snooze). Ghost mode is honored for the shared-event variant only. Names are allowed because both people are already connected.

## Organizer auth

`userMayManageBeacon`: `map_beacons.creator_id` **or** a `venue_managers` row for `map_beacons.venue_id`. RSO creators use `/e/{id}/manage`, not `/insights` (subscription-gated).

## APIs

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/beacons/public-events` | none |
| GET | `/api/beacons/{id}/public` | none |
| POST | `/api/beacons/{id}/rsvp/guest` | none, rate-limited |
| GET | `/api/beacons/{id}/rsvp/guests` | organizer |
| GET/POST/DELETE | `/api/beacons/{id}/rsvp` | session (Click RSVP; returns `request_status`, `attendees`, `rsvp_count`) |
| GET/POST | `/api/beacons/{id}/rsvp/requests` | organizer (approve / deny pending or waitlisted) |
| GET/POST | `/api/beacons` | session (create event + map fetch) |
| GET/PATCH/DELETE | `/api/beacons/{id}` | session (PATCH is creator; event listing columns + location) |
| GET | `/api/beacons/mine` | session |
| GET | `/api/beacons/{id}/mutual-attendees` | session |
| GET | `/api/beacons/{id}/recap` | participant |
| GET | `/api/beacons/{id}/recap-summary` | organizer |
| GET | `/api/beacons/{id}/network-health` | organizer |
| GET/POST | `/api/beacons/{id}/guest-list` | organizer |
| POST | `/api/beacons/{id}/guest-list/match` | organizer |
| GET | `/api/beacons/{id}/teasers` | organizer (counts only) |
| GET | `/api/me/event-bookmarks/{id}/teaser` | session (bookmark, RSVP, or matched guest) |
| GET | `/api/me/nudges` | session |
| POST | `/api/me/nudges/{id}/dismiss` | session |
| POST | `/api/me/nudges/{id}/snooze` | session |
| POST | `/api/me/nudges/{id}/acted` | session |
| GET | `/api/cron/nudges-reconnect` | `CRON_SECRET` |
| POST | `/api/beacons/{id}/summary/publish` | organizer |
| GET | `/api/beacons/{id}/summary?token=` | none |
| PATCH | `/api/user/ghost-mode` | session |
| GET | `/api/insights/{venueId}/events` | venue manager |
| GET | `/api/insights/{venueId}/network-health-trend` | venue manager |

Recap and network-health both call [`lib/events/eventRecap.ts`](../../lib/events/eventRecap.ts) and count unique `connection_id` values on `connection_encounters.event_beacon_id`.

## Schema (additive)

**Live Event Options** (`20260828190000_event_listing_options.sql`, mirrored in click): `map_beacons.event_visibility` (`public | unlisted | invite_only`), `event_capacity`, `approval_required`, `guest_list_visibility` (`public | hosts_only`), `cover_theme_id`, plus `event_rsvp_requests`. Listing visibility is **not** the map pin enum — do not add values to `beacon_visibility_audience`. Unlisted / invite-only map to `visibility_audience = connections` so they stay off strangers’ maps.

**Live time columns:** create dual-writes `starts_at` / `ends_at` / `event_timezone` and `metadata.event_start_at` / `event_end_at` / `event_timezone`. Reads prefer columns, then metadata.

Still unused until dedicated PRs: `event_participation`, `series_id` / `owner_org_id`, funnel tables. Guests still write `event_guest_rsvps`. Organizer auth is still `creator_id` or `venue_managers`. See [`event-schema-scaling-followups.md`](../event-schema-scaling-followups.md) and [`docs/design-assets/events-web/DESIGN.md`](../design-assets/events-web/DESIGN.md).
