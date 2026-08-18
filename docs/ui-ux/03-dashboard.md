# Personal dashboard — Functional Clarity (Web)

**Mount:** `/` when authenticated (`DashboardView`). `/dashboard` redirects.  
**File:** [`components/DashboardView.tsx`](../../components/DashboardView.tsx)  
**Modules:** [`components/dashboard/`](../../components/dashboard/)

---

## Shell

- Flat `background`; sticky tab bar = opaque `surface` + 1px outline-variant border (no backdrop-blur).
- Tabs: memory, map, chat, identity, settings.
- Active tab: solid primary underline or primary-container chip.

### Chat tab — message search

The Messages list includes a search field. Querying `GET /api/chat/search?q=` plus a decrypted recent-page client search returns hits with `messageId`, `conversationId` / `connectionId`, `senderId`, timestamp, snippet, and hub `hubRealtimeChannel` when `isHub`. Large membership lists are queried in PostgREST `.in()` chunks so search cannot fail closed with zero hits. Selecting a hit opens `ChatView` with `targetMessageId`, which loads `GET /api/chat/messages?aroundMessageId=` if needed, scrolls the bubble into view, and pulse-highlights it for ~1.8s.

Mobile unified search uses the same `GET /api/chat/search` as the remote message scan (local name/beacon/intent matching still runs on-device). Hub chat init hydrates through `GET /api/hub/messages?hubId=` (messages + `participant_ids`) so the pulsing logo cannot wait on Realtime subscribe alone.

---

## Modules

Migrate glass panels → `FcCard`:

- Stats, QR identity, connections table, map, chat list, availability, time capsule

Accent: `#630ED4` / primary-container for brand; `#224CFF` secondary for events/map emphasis (no ad-hoc blue gradient avatars).

### Generated entity identity

Chrome stays flat, but anything representing a specific entity paints its deterministic gradient + pattern through `CardVisualHero` / `cardVisualStyle` (see § Generated entity visuals in `01-design-system-web.md`), seeded on the **raw entity id**:

| Surface | File |
|---------|------|
| Map beacon popups | `lib/map/beaconPopupHtml.ts` (`cardVisualStyleCss`) |
| Profile Beacons tab rows + detail header | `components/UserProfileModal.tsx` |
| Time capsule chapter headers | `components/dashboard/TimeCapsule.tsx` — replaces the old fixed `getChapterColor` cycle |
| Connection avatar fallbacks | `components/dashboard/ConnectionPeerAvatar.tsx` — replaces the old label-hash `hsl()` gradient |
| Connection popup chat buttons | `components/dashboard/ConnectionMap.tsx` — `accentColorForStableId`, not a hardcoded purple |

The beacon detail header is decorative: it carries the status chip only, and title / schedule / location live once in the structured section below it.

---

## Appearance

Theme is controlled from the **Navbar** toggle only. Settings does not duplicate dark/light mode.

---

## Maps

Basemap follows theme: light → Carto Positron; dark → Carto Dark Matter.

The logged-out landing playground uses the same Carto styles **in the browser** (cartocdn.com). Tiles are not proxied through the Cloudflare Worker (`transformRequest` blocks same-origin). MapLibre is code-split via `PlaygroundMapLazy`.
