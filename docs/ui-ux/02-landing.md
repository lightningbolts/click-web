# Landing — Functional Clarity (Web)

**Route:** `/` (logged-out marketing). Logged-in users mount `DashboardView` instead.  
**Files:** [`app/page.tsx`](../../app/page.tsx), [`components/landing/LandingPage.tsx`](../../components/landing/LandingPage.tsx), [`components/landing/playground/`](../../components/landing/playground/)

---

## Hero (first viewport)

Logo is the primary viewport (Circle-style splash), filling the remaining height below the Navbar:

- Large `ClickLogo` mark (~180px), then **Click: from handshake to friendship.**
- Tagline: “Stop scrolling. Start living.”
- One primary CTA (`Join the Waitlist`) + **About** text link.
- Login / signup live in the Navbar — not duplicated in the hero.
- Navbar also links **Events** (`/events`, public) and **Create event** (`/events/new`). The landing playground Events scene can deep-link to `/events`.

**Remove:** giant typeset headlines, screenshot frames, waitlist + create-account + sign-in stacks.

---

## Below fold

1. **Why Click exists** (`#why`) — the follow-back void, handle handoff, name without a where, and apps built to scroll. Primary accent on the key line and alternating card borders.
2. **How it helps** — three columns: In person (Proximity Tap), Events (RSVP / show up), Context (memory capsule).
3. **Try it** (`#how-it-works`) — interactive playground. App scenes: Connect (Add Click hub, real QR), Events (home/RSVP), Clicks (chat inbox), Map (MapLibre pin overlay), Settings (no theme toggle). Website companion mirrors the logged-in dashboard: vertical sidebar (Memory Box, Map, Chat, QR Identity), MapLibre pins, with shared mock state (no `/api/*`). Map is **lazy-loaded** (`PlaygroundMapLazy`) so MapLibre is not in the anonymous `/` Worker JS. Basemap is Carto Positron / Dark Matter fetched **in the browser from cartocdn.com** (never proxied through the Worker; `transformRequest` drops same-origin URLs). Viewport is clamped to greater Seattle (UW + Pike Place) with `pixelRatio: 1` and a one-shot `fitBounds`. Navbar light/dark calls `setStyle({ diff: true })` in place and restores the camera — do not remount MapLibre. Pins: overlapping circular markers (purple `#7c3aed` for connections and events) and a selected pin overlay (title, time/venue, You're going, pin stack).
4. **Mission** — “Built for the moment you put your phone down.”
5. **Enterprise** — one sentence linking to `/enterprise`. Partner Insights live there, not on `/`.
6. **Close** — waitlist card. Trust line: no ads, no feed, built at UW.

Navbar **How it works** scrolls to `#how-it-works`.

---

## Theme

Must read correctly in light and dark via CSS tokens. Interactive accent `#7c3aed` for brand/CTAs/links/pins. Verify both after restyle. Toggling the Navbar theme while the playground map is open must not remount MapLibre or `fitBounds` again (Carto `setStyle` in place).

---

## Checklist

- [x] No `.glass` / glow / `#8338EC` on landing
- [x] Manrope only
- [x] Primary CTAs use `#7C3AED` / `bg-primary`
- [x] Hero is brand-first / low-clutter (logo viewport)
- [x] Screenshots replaced by playground
- [x] Playground map shows real Seattle/UW Carto tiles (browser CDN, not Worker)
- [x] Theme toggle does not remount the playground map
- [x] Enterprise analytics not on `/`
