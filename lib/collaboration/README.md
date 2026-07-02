# Collaboration library (`lib/collaboration`)

**Collaboration sessions** open a time-boxed window after every connection bump (new or reconnect) for **Disposable Rolls** (Click Drops) and squad map activity. TTL computation, session creation, and reveal timing are centralized here.

---

## Purpose

| File | Role |
|------|------|
| `createCollaborationSession.ts` | Insert `collaboration_sessions` row linked to connection/chat |
| `collaborationTtl.ts` | Compute `collaboration_ttl` — next local day 10:00 AM |
| `clickDropReveal.ts` | Per-message reveal TTL — 24h after send |

---

## Architecture

```
Proximity bind / QR redeem / encounter API
    │
    ▼
createCollaborationSessionForConnection(admin, connectionId, participantIds, tzOffset)
    │
    ├─ collaboration_ttl  (session window — squad features)
    └─ encounter_id       (UUID = session id)
            │
            ▼
User sends disposable_roll message
    │
    ▼
buildMessageInsertRow → metadata.collaboration_ttl / reveal_at (+24h)
    │
    ▼
cron-hourly-maintenance → push when reveal_at ≤ now
```

### `createCollaborationSession`

`createCollaborationSessionForConnection`:

- Participants: unique sorted user IDs (min 2)
- Looks up `chats.id` for `connection_id`
- Inserts `collaboration_sessions` with `notification_sent: false`
- Returns `{ encounterId, collaborationTtl }`

`createCollaborationSessionForChat` — chat-scoped variant (`connection_id` null) for group cliques.

**Independent of encounter rate limits** — session opens even when encounter insert is rate-limited.

### Core connections

Core pins (`connection_core` table, `/api/connections/core`) affect map beacon visibility and social graph priority; collaboration sessions apply to **all** bumps including core friends.

### Disposable reveal flow

1. **Session TTL** (`collaborationTtl.ts`) — window for squad/collab UI (typically until 10 AM next local day)
2. **Message reveal** (`clickDropReveal.ts`) — `computeClickDropRevealTtlIso(now)` = now + **24 hours**
3. **Cron** — `hasRevealedDisposableMessage` checks `messages.metadata.disposable_roll`, `encounter_id`, `collaboration_ttl`
4. **Push** — `type: disposable_reveal` via `send-push-notification`

---

## E2EE / API constraints

- Disposable photos are E2EE in `content` like normal media; metadata flags `disposable_roll` are plaintext for server reveal scheduling.
- Server must not decrypt image bytes to reveal — clients decrypt after TTL when fetching message.
- `encounter_id` in metadata ties message to `collaboration_sessions.id`.

---

## Related files

| Path | Role |
|------|------|
| `lib/chat/messages.ts` | Stamps reveal metadata on insert |
| `app/api/chats/[chatId]/collaboration-session/route.ts` | Chat-scoped session |
| `app/api/connections/[connectionId]/collaboration-session/route.ts` | Connection-scoped session |
| `app/api/cron/disposable-reveal/route.ts` | Vercel cron mirror |
| `supabase/functions/cron-hourly-maintenance/index.ts` | Primary reveal cron |
| `supabase/migrations/20260605120000_collaboration_sessions.sql` | Schema |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Opens collaboration session automatically on bind.
- **Scan QR** — Session on redeem when connection exists.
- **Group connect (Multi-Tap)** — Group session with all participant IDs.
- **Private encrypted chat** — Drops are E2EE messages in same chat.
- **Send photos/files/voice notes** — **Disposable rolls** are a special photo mode.
- **Emoji reactions** — On revealed messages.
- **Typing & read receipts** — Standard chat.
- **Voice & video calls** — Parallel to collab window.
- **Memory Capsules** — Encounter logged alongside session.
- **48-hour gentle archive** — Session tied to active connection.
- **Connection map & timeline** — Squad map drops during window.
- **Rate the vibe** — After hangout.
- **QR identity card** — Entry to connection.
- **Availability intents** — Independent.
- **Match alerts** — Independent.
- **Community Hubs** — Separate ephemeral rooms.
- **Map beacons** — Squad may drop beacons during collab TTL.
- **Global search** — Dashboard.
- **Core connections** — Re-bump with core friend reopens roll window.
- **Collaboration sessions & disposable rolls** — **Core module feature**.
- **Ghost mode** — Unaffected.
- **Block & report** — Ends collaboration access.
- **Profile & interests** — Unaffected.
- **Onboarding** — Unaffected.
- **Google/email auth** — Required.
- **Push notifications** — **Click Drops revealed** push.
- **Deep links & App Clip** — Open chat to view reveal.
- **Web dashboard** — Send/view drops in ChatView.
- **Business insights** — Re-engagement signal.
- **Event reminders** — Independent.
- **Achievements & stats** — Drop participation stats.
