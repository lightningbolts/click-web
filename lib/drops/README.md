# Click Drops: develop state (`lib/drops`)

One state machine for every Click Drop (chat now; event and shared drops reuse it). Spec §2.

| State | When | Client shows |
|-------|------|--------------|
| `pending` | before `reveal_at` | pixelated preview + countdown |
| `ready` | `reveal_at` passed, viewer hasn't developed | quiet pixelated preview, no badge |
| `developed` | viewer tapped, or was on screen at zero | the original |

`developed` is per viewer and stored server-side (`drop_views`), so it syncs across devices.

## Gating originals

Clients must only ever hold the pixelated rendition before `reveal_at`.

- Gated media lives in the private `click-drops` bucket, which has **no** client storage policies.
- **Chat drops** (flag `drops_develop`): the sender uploads the E2EE pixelated preview as the
  message's normal media, and the E2EE original through `POST /api/chat/media` with
  `drop_original: true` (response has `url: null`). The message names the original once in
  `metadata.drop_original_path`; `lib/server/chatMessageWrite.ts` moves it into
  `chat_drop_originals` and stores `drop_gated: true` instead. The original's v2 media fields travel
  in `metadata.drop_original` so recipients can decrypt it after developing.
- Legacy drops (original already in the message) still develop through the same endpoint; they just
  have no original to sign.

## Event drops (F1, flag `event_drops`)

Checked-in attendees post up to `per_user_cap` (10) drops from event start until local midnight at
the end of the event (`lib/events/eventDropSchedule.ts`, event timezone, DST-safe). Every drop of an
event reveals together at `reveal_hour_local` (10:00) the next morning. The client uploads the
original and its pixelated preview together; both go to `click-drops` under
`event/{beacon}/{user}/`. Eligibility keys off check-in, never RSVP or ticket source.

| Route | Role |
|-------|------|
| `GET /api/beacons/{id}/drops` | `{ state: before\|open\|developing\|revealed, opens_at, closes_at, reveal_at, access, can_post, remaining, show_to_absentees, drops }` |
| `POST /api/beacons/{id}/drops` | `{ client_drop_id, mime_type, original_b64, preview_b64, width?, height?, show_to_absentees? }`; 403 `not_checked_in` / `window_closed`, 409 `cap_reached`; retries with the same `client_drop_id` return the same drop |
| `DELETE /api/beacons/{id}/drops/{dropId}` | Poster only, any time; media removed |
| `PUT /api/beacons/{id}/drops/settings` | `{ show_to_absentees }` for the poster's drops at this event |
| `POST /api/drops/report` | Quiet report on any drop the reporter can see |

Visibility (`visibleEventDrops`): before reveal, only your own; after, participants (checked in or
host) see all, own first; people who RSVP'd but never checked in see up to `absentee_limit` (6)
drops from posters who allow it, round-robin across posters; blocked people never appear. Opening
the recap develops everything through `POST /api/drops/develop` (kind `event`). The hourly
`/api/cron/drops` sends one "Your recap from {event} is ready" to checked-in attendees in the
cohort; events with drops skip the older end-of-event recap push so nobody gets two.

## Shared drops (F3, flag `shared_drops`)

One drop to all your connections or only core ones, developing `develop_hours` (1, like a story) after posting.
Multi-recipient, so **not end-to-end encrypted** like chat drops: media sits in `click-drops`
(`shared/{user}/…`) behind server access checks, originals signed only after reveal. The audience
is resolved on every read (`lib/drops/sharedAudience.ts`): both people must have each other as an
active connection (not archived, hidden or blocked on either side), and a core-only drop also needs
the poster's core mark — so archiving, un-coring or blocking applies immediately. Cap: `daily_cap`
(3) per rolling 24 h, deleted drops included, enforced by a trigger.

| Route | Role |
|-------|------|
| `GET /api/me/shared-drops` | The Home strip: every drop from the last `strip_window_hours` (24) when there are more than `strip_min` (25), otherwise the newest `strip_min` whatever their age (bounded by `strip_max`, 150). Yours and your connections', newest first, with your `developed_at`; drops you've developed also carry `original_url` (signed) and `reactions` (as `GET /api/reactions/shared_drop/{id}`), so the strip needs no follow-up calls. Pending ones show as pixelated teasers when `teaser` is `pixelated` |
| `GET /api/me/shared-drops/archive?before=&limit=` | Every drop you can see (the archive behind Home's "View all"), newest first, 30 a page (max 60), same drop shape as the strip. `next_before` is the next page's cursor, null at the end |
| `POST /api/me/shared-drops` | `{ client_drop_id, audience: all\|core, mime_type, original_b64, preview_b64, width?, height? }`; 409 `cap_reached` |
| `DELETE /api/me/shared-drops/{id}` | Poster only, any time (not flag-gated) |

No likes, views or counts; replying opens the existing 1-1 chat (`connection_id` in each item).

## Event history (F2, flag `event_history`)

`GET /api/me/event-history?filter=all|went|rsvpd|saved|hosted` (private), `GET
/api/me/event-history/recap-card` (the one Home card: an event you were at or hosted that ended in
the last `recap_card_hours`), `GET /api/users/{id}/events-together` (only events both checked in
to). Built from the live tables — `event_participation` isn't dual-written yet.

## API

| Route | Role |
|-------|------|
| `POST /api/drops/develop` | `{ drops: [{ kind, id }] }` (1–50). Ready → marks developed, returns a 10-minute signed URL for gated originals. Pending stays pending. Unknown/forbidden → `not_found`. |
| `GET /api/drops/views?kind=chat&ids=…` | The viewer's `developed_at` per drop. |
| `GET /api/cron/drops` | Hourly: one batched "ready to develop" push per recipient (`type: disposable_reveal`). |

Gated drops are excluded from the legacy per-session reveal push so nobody is notified twice.

## Files

| Path | Role |
|------|------|
| `lib/drops/developState.ts` | Pure state machine (mirrored in Swift/Kotlin) |
| `lib/server/drops/storage.ts` | Bucket, path layout, signing, removal |
| `lib/server/drops/chatDrops.ts` | Gated chat-drop extraction, registry, access resolution |
| `lib/server/drops/develop.ts` | Batch develop across kinds |
| `lib/cron/dropsReady.ts` | Batched ready push |
| `lib/server/featureFlags.ts` | Server-driven flags (`GET /api/me/features`) |
| `supabase/migrations/20260930000000_feature_flags_and_drop_develop.sql` | Schema |
