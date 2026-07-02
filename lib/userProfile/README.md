# User profile library (`lib/userProfile` + profile UI)

Profile surfaces: **modal inspection** of connections, **timeline journal**, **interest tagging**, **availability intents**, and **settings** — shared between dashboard and public profile routes.

---

## Purpose

| Module | Role |
|--------|------|
| `formatSharedConnection.ts` | Shared connection card + weather snapshot normalize |
| `availability.ts` | Availability state helpers |
| `sharedInterests.ts` | Interest overlap between peers |
| `components/UserProfileModal.tsx` | Rich peer profile + decrypted message preview |
| `components/UserProfile.tsx` | Profile page sections |
| `components/InterestTagging.tsx` | Tag editor UI |
| `components/SettingsView.tsx` | Settings shell (imported by dashboard) |

---

## Architecture

```
DashboardView
    ├─ UserProfileModal(connection) — peer deep-dive
    ├─ InterestTagging — edit my interests
    └─ SettingsView — prefs, notifications, account
            │
            ▼
API routes
    ├─ GET/PATCH /api/users/[userId]/profile
    ├─ GET /api/users/[userId]/public-profile
    ├─ GET/POST /api/profile/timeline
    ├─ GET/POST /api/user/availability-intents
    ├─ GET/POST /api/user/preferences
    └─ POST /api/user/delete
```

### Profile modal

`UserProfileModal.tsx`:

- Peer avatar, name, shared interests
- Decrypted recent messages preview (`DecryptedProfileMessage`)
- Connection metadata (where/when met, vibe context)
- Actions: chat, call, block (via safety APIs)

### Timeline journal

`GET/POST /api/profile/timeline`:

- `profile_timeline_entries` table (migration `20260628165700_profile_timeline_entries.sql`)
- User-authored journal lines alongside system encounter chapters
- Dashboard `TimeCapsule` / chapters from `lib/dashboard/mockData.ts` complement automated encounter narrative

### Interest tagging

`InterestTagging.tsx` + `sharedInterests.ts`:

- Stores user interest tags for matching and profile display
- Highlights overlap when viewing a connection's profile

### Settings

`SettingsView` (in `components/`):

- Notification preferences (`lib/notifications/preferences.ts`)
- Account sign-out, avatar upload `/api/user/avatar`
- Ghost mode and privacy toggles (client prefs + API where persisted)

### Availability

`availability.ts` + `CurrentAvailabilitySection`:

- Works with `/api/user/availability` and `/api/user/availability-intents`
- Durations from `lib/availabilityIntentDurations.ts`

---

## E2EE / API constraints

- Profile message previews decrypted **in browser** with connection keys — API returns ciphertext from messages query.
- Public profile route exposes only non-sensitive fields (name, image, public interests).
- Timeline entries are user-written plaintext (not E2EE) — separate from chat.

---

## Related files

| Path | Role |
|------|------|
| `components/UserProfileModal.tsx` | Modal UI |
| `components/UserProfile.tsx` | Standalone profile |
| `components/InterestTagging.tsx` | Tags UI |
| `components/SettingsView.tsx` | Settings |
| `lib/userDisplayName.ts` | Display name resolution |
| `lib/AuthContext.tsx` | `profileImageUrl` sync |
| `app/c/[userId]/page.tsx` | Universal link profile landing |
| `app/api/users/[userId]/profile/route.ts` | Private profile API |

---

## What Click Users Experience

- **Connect in person (Tri-Factor)** — Profile shows how/where you met.
- **Scan QR** — Profile link `/c/{userId}`.
- **Group connect (Multi-Tap)** — Group member profiles.
- **Private encrypted chat** — Open from profile modal.
- **Send photos/files/voice notes** — Preview in profile modal (decrypted).
- **Emoji reactions** — Visible on preview messages.
- **Typing & read receipts** — In full chat.
- **Voice & video calls** — Start from profile.
- **Memory Capsules** — Encounter context on profile.
- **48-hour gentle archive** — Archived peers hidden from active profile shortcuts.
- **Connection map & timeline** — Timeline journal + auto chapters.
- **Rate the vibe** — Vibe on connection card.
- **QR identity card** — Links to own profile/universal link.
- **Availability intents** — Set on profile/settings area.
- **Match alerts** — When intents overlap.
- **Community Hubs** — Hub participant display names.
- **Map beacons** — Creator profile optional on beacons.
- **Global search** — Find connections to open profile.
- **Core connections** — Mark core from connection UI.
- **Collaboration sessions & disposable rolls** — From chat, not profile.
- **Ghost mode** — Privacy setting in settings.
- **Block & report** — From profile modal.
- **Profile & interests** — **Core module**.
- **Onboarding** — Collect name, interests, avatar.
- **Google/email auth** — Profile from OAuth metadata.
- **Push notifications** — Prefs in settings.
- **Deep links & App Clip** — `/c/{userId}` profile landing.
- **Web dashboard** — Modal from table/map.
- **Business insights** — Operator view is separate B2B profile.
- **Event reminders** — Creator identity on events.
- **Achievements & stats** — Stats on own profile/dashboard.
