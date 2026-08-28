# Event schema scaling — follow-up work

This document is **not** the schema migration. Schema for P0–P3 and engagement tables is already additive in `click-web/supabase/migrations/20260824010000_*` through `20260824060000_*`. **Do not consume those columns/tables in app code until the PRs below.** Live product still uses `metadata` jsonb, `beacon_attendees`, `event_bookmarks`, `event_check_ins`, and `event_guest_rsvps`.

## Production record (2026-08-23 / 2026-08-24)

These migrations are **already applied** on the live Click Supabase project (`lrgcwnmcscimkmslihxp`). Do not re-run them. Do not write a down-migration.

| Version | Name |
|---------|------|
| `20260823180000` | `event_guest_rsvps_and_ghost_mode` |
| `20260824010000` | `event_time_and_participation` |
| `20260824020000` | `event_series_and_organizations` |
| `20260824030000` | `event_engagement_funnel_schema` |
| `20260824040000` | `event_cleanup_venue_beacon_tags` |
| `20260824050000` | `event_attendee_count_and_moderation` |
| `20260824060000` | `event_analytics_partitioned_shells` |

On 2026-08-24, click-web `main` was reset to `382158d` so [PR #32](https://github.com/lightningbolts/click-web/pull/32) (Reallyrealistic / Andrew Lu) could merge without conflicts. The public event microsite / guest-RSVP **application** is re-landed on `feature/event-microsite` on top of that split-file tree. Original commits remain on `backup/event-microsite-20260823`.

Guest RSVP / public event helpers (`lib/events/publicEvent.ts`) count RSVPs from `beacon_attendees` + `event_guest_rsvps`. First-class time columns are dual-written on event create and preferred on public reads, with metadata fallback. `event_participation` stays unused until the dual-write PRs below.

## Dual-write `event_participation` (after P0 backfill is verified)

Any write to a legacy table also upserts `event_participation`:

| Legacy write | Participation `status` / timestamps |
|--------------|--------------------------------------|
| `event_bookmarks` insert | `bookmarked` (unless already `rsvpd` / `checked_in`); set `bookmarked_at` |
| `event_bookmarks` delete | drop bookmark timestamp; demote status if it was only `bookmarked` |
| `beacon_attendees` insert | `rsvpd` unless `checked_in`; set `rsvpd_at` |
| `beacon_attendees` delete | clear `rsvpd_at`; demote unless still checked in / bookmarked |
| `event_check_ins` insert/update | `checked_in`; set `checked_in_at` / `checked_out_at` |

Guest RSVPs stay in `event_guest_rsvps` only. `countEventRsvps` in `lib/events/publicEvent.ts` keeps summing `beacon_attendees` + `event_guest_rsvps`.

Only after a full deploy cycle of verified dual-writes should a **future**, separate migration consider deprecating the legacy tables.

## First-class event time (live)

- **Writes:** event create (`POST /api/beacons` with `kind=event`, `EventCreateForm`, mobile `BeaconDropSheet`) sets `starts_at` / `ends_at` / `event_timezone` **and** `metadata.event_start_at` / `event_end_at` / `event_timezone`.
- **Reads:** prefer the new columns; fall back to `eventStartAtFromMetadata` / `eventEndAtFromMetadata` / `eventTimezoneFromMetadata`.
- **Cron:** `lib/cron/eventReminders.ts` still parses metadata today. Switch to columns after dual-write, still falling back to metadata.

## Recurrence (`series_id`)

Current create flow inserts one `map_beacons` row. Recurrence should generate a shared `series_id` (uuid, not a self-FK) and `series_sequence` at creation. Do not change `POST /api/beacons` until that product ships.

## Organization ownership

`userMayManageBeacon` stays `creator_id` **or** `venue_managers` for `venue_id`. `owner_org_id` is an optional extra layer. Do not replace venue RBAC or Insights Stripe gating with orgs.

## Engagement types and anonymous sessions

Keep live values: `event_view` (detail open via `POST /api/beacons/{id}/impressions`), `share`, `bookmark_set` / `bookmark_unset`, `rsvp_set` / `rsvp_unset`, `check_in` / `check_out`, `check_in_rejected`.

Add without renaming:

- `impression` — card rendered in feed/list/map (batch client-side)
- `link_click` — opened a shared `/e/{id}?ref=` link

`event_engagement_events.user_id` is already nullable. Logged-out microsite views should set `anonymous_session_id` (client-generated, non-PII) and leave `user_id` null. No IP or device fingerprinting.

`beacon_share_tokens`: mint on share, put `?ref=token` on `/e/{beaconId}`. `link_click` metadata should include the token. Service-role writes only (BFF), matching `event_engagement_events`.

## Daily stats cron

Do not query `event_engagement_events` from the organizer network-health dashboard once this exists.

- Add `GET /api/cron/event-daily-stats` with `Authorization: Bearer $CRON_SECRET`.
- Upsert `event_beacon_daily_stats`.
- Hook into `cron-hourly-maintenance` and `/api/cron/hourly` (see `lib/cron/README.md`).
- Network-health (`/api/beacons/{id}/network-health`, recap) can later read this table instead of scanning raw telemetry.

## Partition cutover (P3.3 is shells only)

Empty `*_p` tables exist. Cutover is its own reviewed project:

1. Background `COPY` / batched insert from live tables into `_p`.
2. Verify counts.
3. Dedicated migration: switch app/BFF writes to `_p`.
4. Keep old tables as archive until confidence is high; drop only in an explicit migration.
5. Retention (suggestion): rows older than 13 months roll into a monthly aggregate, then drop from the live partitioned table.

PK on shells is `(id, ts)` because RANGE partitioning cannot keep a uuid-only PK. App insert code must supply or accept that.

`CREATE INDEX CONCURRENTLY` is not used in these migrations (Supabase `db push` is transactional; tables were tiny at authoring time). If analytics tables grow, reindex concurrently via the SQL editor, not a transactional migration.

## Encounter dual refs (P2.1)

Run `npx tsx scripts/report_encounter_event_refs.ts` before any column drop. `event_id` is registry/Ticketmaster text; `event_beacon_id` is `map_beacons` UUID. Discovery snapshot (2026-08-23): 11 `event_id` only, 0 `event_beacon_id` only, 0 disagree.

## Apply order on remote

**Already applied** on production in this order: `20260823180000` then `20260824010000`–`20260824060000`. New environments should apply the same sequence. Never apply P0 in isolation on a database missing the guest/ghost migration.

## Backfill commands

```bash
cd click-web
DRY_RUN=1 npx tsx scripts/backfill_map_beacon_event_times.ts
npx tsx scripts/backfill_map_beacon_event_times.ts

DRY_RUN=1 npx tsx scripts/backfill_event_participation.ts
npx tsx scripts/backfill_event_participation.ts

# After P3.2 migration + participation backfill
DRY_RUN=1 npx tsx scripts/backfill_map_beacon_attendee_count.ts
npx tsx scripts/backfill_map_beacon_attendee_count.ts

npx tsx scripts/report_encounter_event_refs.ts
```

Verify before P1 app work: participation row count equals distinct `(beacon_id, user_id)` across the three legacy tables; spot-check `starts_at` vs `metadata.event_start_at`.
