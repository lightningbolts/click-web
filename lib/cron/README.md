# Cron library (`lib/cron`)

Scheduled maintenance invoked from **Vercel cron routes** and mirrored in **Supabase pg_cron** (`cron-hourly-maintenance` Edge Function). Handles **event reminders**, **disposable roll reveal** pushes, and **friction intent expirations** (failed conversion analytics).

---

## Purpose

Keep time-based product mechanics reliable without user interaction: reveal Click Drops, remind event creators, and log B2B friction when availability intents expire without a connection.

---

## Architecture

```
pg_cron (hourly) ──► cron-hourly-maintenance Edge Function
                           │
Vercel cron ──────────────┼──► /api/cron/hourly
                           ├──► /api/cron/event-reminders
                           ├──► /api/cron/disposable-reveal
                           └──► /api/cron/friction-intent-expirations
                                        │
                                        ▼
                              lib/cron/eventReminders.ts
                              (shared logic with Edge)
```

Configured in `vercel.json` for Vercel paths; Supabase schedule in `20260607120000_pg_cron_hourly_maintenance.sql`.

### `eventReminders.ts`

`runEventReminders(admin, pushUrl, authBearer, nowMs?)`:

1. Query `map_beacons` where `beacon_type = 'event'`
2. Parse `metadata.event_start_at` / `event_end_at`
3. Skip ended events
4. Within **15-minute** windows:
   - **day_of** — morning of event day
   - **one_hour** — 60 minutes before start
5. POST `send-push-notification` with `type: event_reminder`
6. Set `day_of_notification_sent` / `one_hour_notification_sent` in beacon metadata

### Hourly maintenance (Edge + `/api/cron/hourly`)

Bundled jobs:

| Job | Description |
|-----|-------------|
| Disposable reveal | Sessions past `collaboration_ttl` with revealed disposable messages → push |
| Event reminders | Same as `eventReminders.ts` |
| Friction expirations | Expired `availability_intents` without encounter → `system_friction_logs` |

### Friction intent expirations

For intents expired in the last hour:

- If user had **no** `connection_encounters` during intent window → log `failed_conversion` with `duration_sec`, `hexbin_id` from `anonymized_cell_id`
- Powers operator **friction** dashboards (intent without conversion)

### 48-hour gentle archive

Connection archive transitions are **not** implemented in `lib/cron` — they live in connection lifecycle APIs and client UX. Hourly cron does not hard-delete connections; archive is reversible via `/api/connections/unarchive`.

---

## E2EE / API constraints

- Cron routes authorize with `CRON_SECRET` or service role — never callable from browser without secret.
- Push payloads contain no message plaintext.
- Disposable reveal checks metadata flags only, not decrypted image bytes.

---

## Related files

| Path | Role |
|------|------|
| `app/api/cron/hourly/route.ts` | Vercel hourly bundle |
| `app/api/cron/event-reminders/route.ts` | Event-only cron |
| `app/api/cron/disposable-reveal/route.ts` | Drops-only cron |
| `app/api/cron/friction-intent-expirations/route.ts` | Friction-only cron |
| `supabase/functions/cron-hourly-maintenance/index.ts` | Supabase primary scheduler |
| `lib/collaboration/clickDropReveal.ts` | 24h message reveal TTL |
| `vercel.json` | Cron schedule |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Encounters prevent false friction logs.
- **Scan QR** — Same.
- **Group connect (Multi-Tap)** — Same.
- **Private encrypted chat** — Unaffected.
- **Send photos/files/voice notes** — Disposable rolls **revealed by cron**.
- **Emoji reactions** — After reveal.
- **Typing & read receipts** — Unaffected.
- **Voice & video calls** — Unaffected.
- **Memory Capsules** — Unaffected.
- **48-hour gentle archive** — Separate lifecycle (not cron-deleted).
- **Connection map & timeline** — Unaffected.
- **Rate the vibe** — Unaffected.
- **QR identity card** — Unaffected.
- **Availability intents** — **Friction logging** when intent expires unused.
- **Match alerts** — Independent scheduler (match-availability).
- **Community Hubs** — Hub TTL is 24h fixed at create.
- **Map beacons** — Event reminders **from cron**.
- **Global search** — Unaffected.
- **Core connections** — Unaffected.
- **Collaboration sessions & disposable rolls** — **Reveal push from cron**.
- **Ghost mode** — Unaffected.
- **Block & report** — Unaffected.
- **Profile & interests** — Unaffected.
- **Onboarding** — Unaffected.
- **Google/email auth** — Unaffected.
- **Push notifications** — **Event + disposable reveal** cron pushes.
- **Deep links & App Clip** — Open from push payload.
- **Web dashboard** — User sees revealed drops in chat.
- **Business insights** — Friction logs feed operator metrics.
- **Event reminders** — **Core cron feature** for creators.
- **Achievements & stats** — Unaffected.
