# Personal dashboard — Functional Clarity (Web)

**Mount:** `/` when authenticated (`DashboardView`). `/dashboard` redirects.  
**File:** [`components/DashboardView.tsx`](../../components/DashboardView.tsx)  
**Modules:** [`components/dashboard/`](../../components/dashboard/)

---

## Shell

- Shared horizontal [`Navbar`](../../components/Navbar.tsx): same top bar as marketing. Signed-in items come from `personalProductNavItems()` (`data-testid="dashboard-tab-{id}"`). Tab state is URL-synced via `/?tab=` except Events, which lives at `/events` (`parseDashboardTab` / `dashboardTabHref` in [`lib/shell/personalProductNav.ts`](../../lib/shell/personalProductNav.ts)). Missing or unknown `tab` defaults to Memory Box. `/?tab=events` redirects to `/events`.
- Page column: [`PAGE_COLUMN_CLASS`](../../lib/shell/pageColumn.ts) (`max-w-6xl` + `px-4 md:px-10`) for Memory Box, settings, identity, chat, and map. Navbar uses the same inner wrapper with no extra bar padding so card edges line up with the logo and account row. Chat is one bordered `rounded-[16px]` panel (`CHAT_PANEL_CLASS`) inside that column.
- Mobile: [`MobileNavDrawer`](../../components/shell/MobileNavDrawer.tsx) stays mounted so open/close can animate (overlay fade + panel slide). `prefers-reduced-motion` uses `motion-reduce:transition-none`.
- Events: [`DashboardEventsModule`](../../components/dashboard/DashboardEventsModule.tsx) on `/events` (hosted + attending) above the public Discover list. Hosted cards put **Edit details** / **Host settings** as top-right icon buttons, not a footer strip.
- Sign out is a button in the Navbar account menu. It clears the session, `router.replace('/')`, and `router.refresh()`. The dashboard unmounts as soon as `useAuth().user` is null.
- Login lands on `/` (legacy `/dashboard` redirects there). [`HomeAuthenticated`](../../components/HomeAuthenticated.tsx) holds **one** `LoadingScreen` until connections and the birthday gate resolve, so the logo does not remount/flash. TOKEN_REFRESHED does not re-set auth user. Anonymous `/` still SSR-renders marketing HTML.
- Footer stays hidden while signed in (`ProductChromeOn` + `user`).
- Insights is the only remaining [`ProductAppShell`](../../components/shell/ProductAppShell.tsx) consumer (horizontal bar, not a desktop sidebar).

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
