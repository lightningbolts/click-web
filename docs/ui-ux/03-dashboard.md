# Personal dashboard — Functional Clarity (Web)

**Mount:** `/` when authenticated (`DashboardView`). `/dashboard` redirects.  
**File:** [`components/DashboardView.tsx`](../../components/DashboardView.tsx)  
**Modules:** [`components/dashboard/`](../../components/dashboard/)

---

## Shell

- [`ProductAppShell`](../../components/shell/ProductAppShell.tsx): full-height sidebar on desktop, hamburger drawer on mobile. Flat `background`; opaque `surface` + 1px `border-hard` (no backdrop-blur).
- Nav items: memory, events, map, chat, identity, settings (`data-testid="dashboard-tab-{id}"`). Tab state is URL-synced via `/?tab=` (`parseDashboardTab` in [`lib/shell/personalProductNav.ts`](../../lib/shell/personalProductNav.ts)). Missing or unknown `tab` defaults to Memory Box.
- Events item: My events, RSVPs, primary **Create event** (`DashboardEventsModule` + `EventCreateForm`) as a dense date-rail list.
- Signed-in `/events*` and `/e/*` reuse the same shell via [`AuthenticatedProductShell`](../../components/shell/AuthenticatedProductShell.tsx). Marketing Navbar is hidden on those paths when a session is present.
- Active item: `bg-primary-container text-on-primary-container`.
- Marketing Navbar is hidden while this shell is mounted.

### Chat tab — message search

The Messages list includes a search field. Querying `GET /api/chat/search?q=` plus a decrypted recent-page client search returns hits with `messageId`, `conversationId` / `connectionId`, `senderId`, timestamp, snippet, and hub `hubRealtimeChannel` when `isHub`. Large membership lists are queried in PostgREST `.in()` chunks so search cannot fail closed with zero hits. Encrypted `e2e:` / `e2e_grp:` bodies are excluded so coincidental Base64 matches cannot appear as hash snippets. Selecting a hit opens `ChatView` with `targetMessageId`, which loads `GET /api/chat/messages?aroundMessageId=` if needed, scrolls the bubble into view, and pulse-highlights it for ~1.8s.

Mobile unified search uses the same `GET /api/chat/search` as the remote message scan (local name/beacon/intent matching still runs on-device). Hub chat init hydrates through `GET /api/hub/messages?hubId=` (messages + `participant_ids`) so the pulsing logo cannot wait on Realtime subscribe alone.

---

## Modules

Migrate glass panels → `FcCard`:

- Stats, QR identity, connections table, map, chat list, availability, time capsule

Accent: `#7C3AED` / `primary` + `primary-container` for brand, links, map pins, and selected states. No hardcoded `#630ed4` or blue secondary on chrome.

### Generated entity identity

Chrome stays flat, but anything representing a specific entity paints its deterministic gradient + pattern through `CardVisualHero` / `cardVisualStyle` (see § Generated entity visuals in `01-design-system-web.md`), seeded on the **raw entity id**:

| Surface | File |
|---------|------|
| Map beacon popups | `lib/map/beaconPopupHtml.ts` (`cardVisualStyleCss`) |
| Profile Beacons tab rows + detail header | `components/UserProfileModal.tsx` |
| Time capsule chapter headers | `components/dashboard/TimeCapsule.tsx` — replaces the old fixed `getChapterColor` cycle |
| Connection avatar fallbacks | `components/dashboard/ConnectionPeerAvatar.tsx` — replaces the old label-hash `hsl()` gradient |
| Connection popup chat buttons | `components/dashboard/ConnectionMap.tsx` — semantic primary accent |

The beacon detail header is decorative: it carries the status chip only, and title / schedule / location live once in the structured section below it.

---

## Appearance

Theme is controlled from the **Navbar** toggle only. Settings does not duplicate dark/light mode.

---

## Maps

Basemap follows theme: light → Carto Positron; dark → Carto Dark Matter.

The logged-out landing playground uses the same Carto styles **in the browser** (cartocdn.com). Tiles are not proxied through the Cloudflare Worker (`transformRequest` blocks same-origin). MapLibre is code-split via `PlaygroundMapLazy`.
