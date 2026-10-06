# Notifications library (`lib/notifications`)

Web notification **preferences** and integration patterns for **`send-push-notification`** Supabase Edge Function. Documents the **`incoming_call`** payload contract shared with mobile `CallPushNotifier.kt`.

---

## Purpose

- Persist per-user push preferences (messages, calls, event reminders, event teasers, reconnect nudges, availability matches, hub messages)
- Align web-initiated pushes with KMP mobile handlers
- Centralize localStorage fallback when `notification_preferences` table unavailable

---

## Architecture

```
API route or DashboardView
    │
    ▼
POST /functions/v1/send-push-notification
    Authorization: Bearer SERVICE_ROLE
    Body: { recipient_user_id, title, body, data: { type, … } }
    │
    ▼
FCM / APNs → Mobile app
```

### `preferences.ts`

| Function | Role |
|----------|------|
| `DEFAULT_NOTIFICATION_PREFERENCES` | `{ messagePushEnabled, callPushEnabled, eventReminderPushEnabled, availabilityMatchPushEnabled, hubMessagePushEnabled, eventTeaserPushEnabled, reconnectNudgePushEnabled }` all default `true` |
| `loadNotificationPreferences(supabase, userId)` | DB first, fallback localStorage |
| `saveNotificationPreferences` | Dual-write DB + local |
| `readLocalNotificationPreferences` | Offline / missing table fallback |

Storage key: `click:web-notification-preferences:{userId}`

### `send-push-notification` integration from API routes

| Caller | Trigger | `data.type` |
|--------|---------|-------------|
| `app/api/chat/messages/route.ts` | New message (recipient offline) | `new_message` |
| `cron-hourly-maintenance` | Disposable reveal | `disposable_reveal` |
| `cron-hourly-maintenance` | Event reminder | `event_reminder` |
| `cron-hourly-maintenance` | Seed-a-Room teaser (24–48h before start) | `event_teaser` |
| `cron-hourly-maintenance` | Reconnect lull / shared upcoming event | `reconnect_nudge` / `shared_upcoming_event` |
| `match-availability` (client invoke) | Intent overlap | `availability_match` |

All server callers use service role bearer to invoke the Edge Function.

### `incoming_call` payload contract (mobile parity)

Built by the native apps (the web builder was removed with the web call UI):

```typescript
{
  recipient_user_id: calleeId,
  title: "Incoming call from {name}" | "Incoming video call from {name}",
  body: "Open Click to answer",
  data: {
    type: "incoming_call",
    call_id: string,
    connection_id: string,
    room_name: string,
    caller_id: string,
    caller_name: string,
    callee_id: string,
    callee_name: string,
    video_enabled: boolean,
    created_at: string,  // ISO
  }
}
```

**Must stay aligned with** KMP `CallPushNotifier.kt` — changing keys requires mobile update.

Incoming-call delivery groups tokens by `device_id`. iOS sends **VoIP first**, then standard APNs only if VoIP failed. Android tokens on that device still send. Dead tokens (APNs 410 / Unregistered / BadDeviceToken, FCM NOT_FOUND) are pruned.

Web invokes:

```typescript
supabase.functions.invoke('send-push-notification', { body: buildIncomingCallPushPayload(invite) })
```

### Push token registration

`POST /api/user/push-tokens` — mobile registers FCM/APNs tokens (not in this folder).

---

## E2EE / API constraints

- Push **never** includes decrypted message body — title/body are generic ("New message", caller name only).
- `data` payload is metadata for deep link routing; no encryption keys.
- User preferences gate whether web should invoke push for calls/messages (client-side check before invoke).

---

## Related files

| Path | Role |
|------|------|
| `app/api/chat/messages/route.ts` | New message push |
| `app/api/user/push-tokens/route.ts` | Device token storage |
| `app/api/livekit/token/route.ts` | Room token for native-app calls (web has no call UI) |
| `supabase/functions/cron-hourly-maintenance/index.ts` | Scheduled pushes |
| `click-web/README.md` | Cross-platform push parity note |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Enables future message pushes with peer.
- **Scan QR** — Same.
- **Group connect (Multi-Tap)** — Group chat pushes.
- **Private encrypted chat** — **Message push** when offline (no plaintext).
- **Send photos/files/voice notes** — Generic push preview.
- **Emoji reactions** — Optional notify.
- **Typing & read receipts** — Not pushed (Realtime).
- **Voice & video calls** — **incoming_call push** wakes mobile app / VoIP.
- **Memory Capsules** — Not pushed.
- **48-hour gentle archive** — Stops pushes for archived threads.
- **Connection map & timeline** — Not pushed.
- **Rate the vibe** — Not pushed.
- **QR identity card** — Not pushed.
- **Availability intents** — **availability_match** push.
- **Match alerts** — Push from match flow.
- **Community Hubs** — Hub messages (client-dependent).
- **Map beacons** — event_reminder and event_teaser push.
- **Global search** — N/A.
- **Core connections** — Same push rules.
- **Collaboration sessions & disposable rolls** — **disposable_reveal** push.
- **Ghost mode** — May suppress identifiable push copy (client).
- **Block & report** — Stops pushes from blocked users.
- **Profile & interests** — Caller name in push title.
- **Onboarding** — Permission prompts on mobile.
- **Google/email auth** — Account for push targeting.
- **Push notifications** — **Core module**.
- **Deep links & App Clip** — Push `data` opens correct screen.
- **Web** — no call UI; calls are native-only.
- **Business insights** — No consumer pushes.
- **Event reminders** — **event_reminder** push.
- **Seed a Room teasers** — **event_teaser** push (pref `event_teaser_push_enabled`).
- **Reconnect nudges** — **reconnect_nudge** / **shared_upcoming_event** (pref `reconnect_nudge_push_enabled`).
- **Achievements & stats** — Optional future pushes.

## Shared drop releases

`drop_release_push_enabled` (default on): "{Name}'s drop just developed" when a connection's shared Click Drop develops. Sent within a minute by `runSharedDropsReleased` on the per-minute `/api/cron/scheduled-messages` tick (hourly `/api/cron/drops` is a backstop). Payload `type: shared_drop_released`, `drop_id`, `poster_id`, `drop_count`; one batched push per viewer per run; audience resolved per viewer like the Home strip.

## Activity inbox

Every alert also lands in `activity_items` (migration `20261016000000_activity_inbox.sql`), the in-app inbox opened from the Home bell, so people who turned push off still see it.

- **Alert pushes:** `send-push-notification` records the types in its `ACTIVITY_TYPES` set, for service callers only, before the mute, preference and token checks. Messages, calls, device approvals and pending prior requests are excluded, because each has its own surface (pending requests are shown live from the Clicks inbox).
- **In-app only:** `lib/server/activity.ts` records reactions (`reaction`, one row per drop or soundtrack) and event RSVPs (`event_rsvp` and `event_rsvp_request`, one row per event). These go to the host.
- **Social, in the database** (migration `20261018000000_activity_social.sql`, inbox only, never pushed):
  - `new_connection`: "You clicked with Maya", for both people, written by a trigger when a handshake connection is created or goes through.
  - `friends_going`: "Maya and 2 others you know are going", one row per event, kept current by a trigger on `beacon_attendees`. To avoid feeling like surveillance it covers only public events with a public guest list that haven't ended, only mutual connections, and never ghost-mode or blocked people. The row is corrected or removed when someone backs out.
  - `event_trending`: upcoming public events that are popular or picking up, from `record_trending_event_activity()` in `cron-hourly-maintenance`. A person gets at most one a day, never the same event twice, and only within 40 km of events they hosted or joined in the last 120 days.
- **Write path:** `record_activity(...)`, a service-role-only RPC, does every write. When rows share a `group_key`, it updates the existing row and moves it to the top instead of adding another. History is kept from the very first item (`20261019000000_activity_full_history.sql` backfilled it all the way back); the `(user_id, created_at DESC)` index keeps paging fast at any depth.
- **Read path:** `GET /api/activity?before=` returns `{ items, seen_at, next_before }`. Each item's `data` is the push payload (string values), so clients route a tap with the same code they use for a push tap. Items about blocked people are left out.
- **Seen:** `POST /api/activity/seen { seen_at }` moves the "new" mark forward and drives the badge.
- **Accepted requests:** when a prior-connection request is accepted, the person who asked gets a `prior_connection_accepted` push (`connection_id`, `peer_user_id`).
