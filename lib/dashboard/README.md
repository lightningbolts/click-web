# Dashboard library (`lib/dashboard` + `components/dashboard`)

Consumer **web dashboard** data layer: connection status normalization, encounter extras for Memory Capsules, intent overlap, user metrics, and orchestration via `DashboardView.tsx` with table/map/timeline/QR components.

---

## Purpose

Transform raw Supabase `connections` + embedded `connection_encounters` into UI-ready `ConnectionRecord` rows for the authenticated user's social graph.

---

## Architecture

```
DashboardView.tsx (orchestrator)
    │
    ├─ ConnectionTable.tsx      — sortable list, archive, chat entry
    ├─ ConnectionMap.tsx        — MapLibre + beacons (lib/map)
    ├─ TimeCapsule / timeline   — moment chapters
    ├─ QRIdentityCard.tsx       — GET /api/qr
    ├─ StatsOverview / AchievementBadge / MilestoneProgress
    ├─ CurrentAvailabilitySection / MyAvailabilityIntentsCard
    ├─ PostConnectionVibePrompt.tsx
    └─ ConnectionPeerAvatar.tsx
            │
            ▼
lib/dashboard/*
    connectionExtras.ts      — weather, noise, context display
    connectionEncounters.ts  — latestEncounter()
    connectionStatus.ts      — normalizeConnectionStatus, isActiveChatListStatus
    connectionEncounters.ts
    intentOverlap.ts         — availability intent UI helpers
    userMetrics.ts           — buildDashboardMetrics, milestones
    mockData.ts              — CSV export, chapter generation (dev/demo)
```

### `DashboardView` orchestrator

`components/DashboardView.tsx` (~3.6k lines) coordinates:

- Auth via `useAuth()`
- Fetch `/api/connections` (active + archived)
- Realtime Supabase subscriptions for connections/messages
- **ChatView** slide-over with E2EE decrypt
- **LiveKit** voice/video + `incoming_call` push invoke
- Settings, profile modal, interest tagging
- Global search filter across connections
- Post-connection vibe prompts

### Connection table / map / timeline

| Component | Data source |
|-----------|-------------|
| `ConnectionTable` | `ConnectionRecord[]` — peer name, vibe, status, last message preview |
| `ConnectionMap` | `geo_location` from latest encounter + `connectionExtras` summaries |
| `TimeCapsule` | `generateChaptersFromConnections` — timeline chapters |
| Profile timeline API | `GET /api/profile/timeline` — journal entries |

### `connectionExtras` normalization

Derives display strings from encounter embed or legacy `memory_capsule`:

- `extractEventContext` — context tags / capsule label
- `extractWeatherSummary` — Open-Meteo snapshot → °F + condition
- `extractNoiseSummary` — category + dB
- `normalizeNoiseCategory` — enum coercion
- `escapeHtml` — safe map popups

### Connection status

`connectionStatus.ts` maps DB `status` + `expiry_state` + `should_continue` to UI states (active, pending, kept, archived, etc.). Used by chat gatekeeper and widget vibe counts.

---

## E2EE / API constraints

- Dashboard decrypts messages client-side with `lib/chat/crypto.ts`; API returns ciphertext.
- Connection list endpoints return peer metadata only — no other users' emails unless connection active.
- Archived connections shown in separate tab; hidden from active chat list.

---

## Related files

| Path | Role |
|------|------|
| `app/dashboard/page.tsx` | Route entry |
| `components/DashboardView.tsx` | Main orchestrator |
| `components/dashboard/index.ts` | Barrel exports |
| `components/UserProfileModal.tsx` | Peer profile + decrypted preview |
| `lib/postClickConnection.ts` | Post-connect UX helpers |
| `lib/userProfile/formatSharedConnection.ts` | Shared connection card |
| `app/api/connections/route.ts` | Connection list API |
| `app/api/profile/timeline/route.ts` | Timeline journal |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — New row appears in table + map pin.
- **Scan QR** — QRIdentityCard generates token; table updates after connect flow.
- **Group connect (Multi-Tap)** — Group rows in table; verified group chat entry.
- **Private encrypted chat** — Open chat from table row.
- **Send photos/files/voice notes** — In ChatView overlay.
- **Emoji reactions** — In chat.
- **Typing & read receipts** — Online presence from AuthContext; read in chat.
- **Voice & video calls** — Call overlay from dashboard.
- **Memory Capsules** — Atmosphere strings on map popups and cards.
- **48-hour gentle archive** — Archive tab + gentle expiry UX.
- **Connection map & timeline** — **Core dashboard features**.
- **Rate the vibe** — PostConnectionVibePrompt.
- **QR identity card** — **QRIdentityCard** component.
- **Availability intents** — CurrentAvailabilitySection + intents card.
- **Match alerts** — Push (opens app to dashboard).
- **Community Hubs** — Separate entry (mobile-first).
- **Map beacons** — Layer toggles on ConnectionMap.
- **Global search** — Dashboard search input filters table.
- **Core connections** — Pin/highlight in table.
- **Collaboration sessions & disposable rolls** — Chat collab UI after bump.
- **Ghost mode** — Proximity pending state (client).
- **Block & report** — Safety from profile/chat menus.
- **Profile & interests** — UserProfileModal + InterestTagging.
- **Onboarding** — Redirect to dashboard after auth.
- **Google/email auth** — Required for dashboard page.
- **Push notifications** — Incoming call + message pushes.
- **Deep links & App Clip** — Land on connection/chat from link.
- **Web dashboard** — **This module IS the web dashboard**.
- **Business insights** — Separate `/insights` app area.
- **Event reminders** — Push to creators.
- **Achievements & stats** — StatsOverview, AchievementBadge, MilestoneProgress.
