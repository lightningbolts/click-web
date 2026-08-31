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
                           ├──► /api/cron/availability-matches
                           ├──► /api/cron/disposable-reveal
                           └──► /api/cron/friction-intent-expirations
                                        │
                                        ▼
                              lib/cron/eventReminders.ts
                              (canonical; Edge Function HTTP-calls this via /api/cron/event-reminders)
```

Configured in `vercel.json` for Vercel paths; Supabase schedule in `20260607120000_pg_cron_hourly_maintenance.sql`.

### `eventReminders.ts`

`runEventReminders(admin, pushUrl, authBearer, nowMs?)` — **canonical implementation**. The Edge Function does **not** duplicate this logic; `cron-hourly-maintenance` HTTP-GETs `/api/cron/event-reminders` with `CRON_SECRET`.

1. Query `map_beacons` where `beacon_type = 'event'`
2. Parse `metadata.event_start_at` / `event_end_at` (first-class `starts_at` / `ends_at` / `event_timezone` columns exist but cron does **not** use them yet; see `docs/event-schema-scaling-followups.md`)
3. Skip ended events
4. Due-by-timestamp (hourly sweep still catches `:30` starts):
   - **day_of** — local calendar day of the event (`metadata.event_timezone`, else UTC)
   - **thirty_min** — 30 minutes before start (also honors legacy `one_hour_notification_sent`)
   - **recap_ready** — after `event_end_at` (`recap_notification_sent`), push to Click RSVPs/check-ins
5. POST `send-push-notification` with `type: event_reminder`
6. Set `day_of_notification_sent` / `thirty_min_notification_sent` in beacon metadata

### Hourly maintenance (Edge + `/api/cron/hourly`)

Bundled jobs:

| Job | Description |
|-----|-------------|
| Disposable reveal | Sessions past `collaboration_ttl` with revealed disposable messages → push |
| Event reminders | Same as `eventReminders.ts` |
| Friction expirations | Expired `availability_intents` without encounter → `system_friction_logs` |
| Event daily stats | **Not scheduled.** Future `GET /api/cron/event-daily-stats` will upsert `event_beacon_daily_stats` (schema exists, unused). |

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
| `app/api/cron/availability-matches/route.ts` | Availability-intent match pushes |
| `lib/cron/availabilityMatches.ts` | Canonical match + `send-push-notification` |
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
- **Match alerts** — Hourly `availabilityMatches` cron; respects `availability_match_push_enabled`.
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
