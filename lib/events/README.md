# Events library (`lib/events`)

Server helpers for **public event microsites**, organizer auth, recap / network-health, and metadata parsing. Introduced with the public-events / guest RSVP work. There is no separate event entity — events are `map_beacons` rows with `beacon_type = 'event'`.

---

## Purpose

| Module | Role |
|--------|------|
| `eventMetadata.ts` | Parse title, schedule, cover, RSVP flag, guest contact from `metadata` jsonb |
| `publicEvent.ts` | Public payload + RSVP counts (`beacon_attendees` + `event_guest_rsvps`) |
| `beaconManageAuth.ts` | `userMayManageBeacon`: `creator_id` or `venue_managers` |
| `requireEventManager.ts` | Route gate for organizer APIs |
| `eventRecap.ts` | People-met / network-health; honors `users.ghost_mode` |
| `eventUrls.ts` | `/e/{beaconId}` share paths |
| `formatEventWhen.ts` | Display strings for start/end |
| `attendeeDirectory.ts` | People directory for authenticated viewers |
| `connectionEventRecommendation.ts` | Suggest events from connection context |
| `guestListParse.ts` | CSV/manual emails + optional Instagram column; SHA-256 email hashes |
| `guestListMatch.ts` | Match hashes against `user_contact_hashes` |
| `eventTeasers.ts` | Anonymized Seed-a-Room teasers among matched Click users |
| `guestListService.ts` | Persist / rematch organizer guest lists |
| `sharedEventNudges.ts` | Shared-upcoming-event nudges on RSVP/bookmark |

---

## Live vs additive schema

**Live path (do not change in the schema-scaling spec):**

- Schedule lives in `metadata.event_start_at` / `event_end_at` (see `eventStartAtFromMetadata` / `eventEndAtFromMetadata`).
- Timezone for reminders: `metadata.event_timezone` (`eventTimezoneFromMetadata`).
- Click RSVP / bookmark / check-in: `beacon_attendees`, `event_bookmarks`, `event_check_ins`.
- Guests: `event_guest_rsvps` only — never `event_participation`.

**Additive schema (unused by this library until [event-schema-scaling-followups.md](../../docs/event-schema-scaling-followups.md)):**

- `map_beacons.starts_at`, `ends_at`, `event_timezone`
- `event_participation` (Click accounts only)
- `series_id` / `series_sequence`, `owner_org_id`
- `event_beacon_daily_stats`, `beacon_share_tokens`

`userMayManageBeacon` must keep ignoring `owner_org_id` until a dedicated org-auth PR.

---

## Related files

| Path | Role |
|------|------|
| `docs/ui-ux/05-events.md` | Product surfaces |
| `docs/event-schema-scaling-followups.md` | Dual-write and cutover PRs |
| `lib/server/eventEngagement.ts` | Telemetry inserts |
| `lib/map/eventSchedule.ts` | Create-time schedule validation |
| `app/e/[beaconId]/page.tsx` | Public share landing |
| `scripts/backfill_map_beacon_event_times.ts` | P0.1 backfill |
| `scripts/backfill_event_participation.ts` | P0.2 backfill |
