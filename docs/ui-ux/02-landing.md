# Landing — Functional Clarity (Web)

**Route:** `/` (logged-out marketing). Logged-in users mount `DashboardView` instead.  
**Files:** [`app/page.tsx`](../../app/page.tsx), [`components/landing/LandingPage.tsx`](../../components/landing/LandingPage.tsx), [`components/landing/playground/`](../../components/landing/playground/)

---

## Hero (first viewport)

**The Fold Map.** Full-bleed Carto map filling the remaining height below the Navbar; offer plate over it, lower-left:

- Map: `FoldMapLazy` / `FoldMap` — Positron / Dark Matter in the **browser** from cartocdn.com (same `transformRequest` / `setStyle` rules as the playground). Presence is a **heatmap of real handshake GPS** (`connection_encounters.gps_lat` / `gps_lon`), each point offset ~90–140 m so the browser never gets an address. Zoom 9–18 (building). Loaded once per hour on the landing SSR — no extra Worker fetch, not pins.
- Plate: `ClickLogo` mark (~56px), **Click: from handshake to friendship.**, tagline “Stop scrolling. Start living.”, proof sentence (phones confirm the room; no feed), one primary CTA (`Join the Waitlist`) + **Why Click exists** (`#why`).
- Login / signup live in the Navbar as a **secondary** control — not a second filled violet. Waitlist is the only filled primary on `/`.
- Navbar also links **Events** (`/events`, public) and **Create event** (`/events/new`). The landing playground Events scene can deep-link to `/events`.

**Remove:** logo-as-the-whole-viewport splash, giant typeset headlines, screenshot frames, waitlist + create-account + sign-in stacks, synthetic neighborhood pins.

---

## Below fold

1. **Why Click exists** (`#why`) — the follow-back void, handle handoff, name without a where, and apps built to scroll. Primary accent on the key line; plates use 1px `border-hard` seams.
2. **How it helps** — three columns: In person (phones confirm you are together), Events (RSVP / show up), Context (place, time, how you met).
3. **Try it** (`#how-it-works`) — interactive playground of connections, map, chat, and QR. App scenes: Connect (Add Click hub, real QR), Events (home/RSVP), Clicks (chat inbox), Map (MapLibre pin overlay), Settings (no theme toggle). Website playground mirrors the logged-in dashboard: vertical sidebar (Memory Box, Map, Chat, QR Identity), MapLibre pins, with shared mock state (no `/api/*`). Map is **lazy-loaded** (`PlaygroundMapLazy`) so MapLibre is not in the anonymous `/` Worker JS. Basemap is Carto Positron / Dark Matter fetched **in the browser from cartocdn.com** (never proxied through the Worker; `transformRequest` drops same-origin URLs). Phone chrome labels are ≥14px. Navbar light/dark calls `setStyle({ diff: true })` in place and restores the camera — do not remount MapLibre. Pins: overlapping circular markers (purple `#7c3aed` for connections and events) and a selected pin overlay (title, time/venue, You're going, pin stack).
4. **Mission** — “Built for the moment you put your phone down.”
5. **Enterprise** — one sentence linking to `/enterprise`. Partner Insights live there, not on `/`.
6. **Close** — waitlist card for the **handshake app** (Fall 2026). Trust line: no ads, no feed, built at UW. Login stays in the navbar.

Navbar **How it works** scrolls to `#how-it-works`.

---

## Theme

Must read correctly in light and dark via CSS tokens. Interactive accent `#7c3aed` for brand/CTAs/links/pins. Verify both after restyle. Toggling the Navbar theme while the playground map is open must not remount MapLibre or `fitBounds` again (Carto `setStyle` in place).

---

## Checklist

- [x] No `.glass` / glow / `#8338EC` on landing
- [x] Manrope only
- [x] Primary CTAs use `#7C3AED` / `bg-primary`
- [x] Hero is Fold Map (city first, offer on a plate)
- [x] Screenshots replaced by playground
- [x] Playground map shows real Seattle/UW Carto tiles (browser CDN, not Worker)
- [x] Theme toggle does not remount the playground map
- [x] Enterprise analytics not on `/`
