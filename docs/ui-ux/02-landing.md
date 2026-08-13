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

**Remove:** giant typeset headlines, screenshot frames, waitlist + create-account + sign-in stacks.

---

## Below fold

1. **Why Click exists** (`#why`) — the follow-back void, handle handoff, name without a where, and apps built to scroll. Secondary `#224CFF` on the key line and event-related cards.
2. **How it helps** — three columns: In person (Proximity Tap), Events (RSVP / show up), Context (memory capsule).
3. **Try it** (`#how-it-works`) — interactive playground. App scenes: Connect (Add Click hub, real QR), Events (home/RSVP), Clicks (chat inbox), Map (MapLibre pin overlay), Settings (no theme toggle). Website companion mirrors the logged-in dashboard: Memory Box, MapLibre pins, Chat, QR Identity, with shared mock state (no network, no `/api/*`). Map is **client-only**: inline GeoJSON style in `playgroundMapStyle.ts` (no Carto/MapTiler/tile or style HTTP). Navbar light/dark retints paint properties in place so the camera, pins, and scroll position stay put — do not remount MapLibre on theme change. Pins: overlapping circular markers (purple connections, secondary event “E”) and a selected pin overlay (title, time/venue, You’re going, pin stack).
4. **Mission** — “Built for the moment you put your phone down.”
5. **Enterprise** — one sentence linking to `/enterprise`. Partner Insights live there, not on `/`.
6. **Close** — waitlist card. Trust line: no ads, no feed, built at UW.

Navbar **How it works** scrolls to `#how-it-works`.

---

## Theme

Must read correctly in light and dark via CSS tokens. Primary `#630ed4` for brand/CTAs; secondary `#224CFF` for events/map/link hover. Verify both after restyle. Toggling the Navbar theme while the playground map is open must not reload tiles, remount MapLibre, or `fitBounds` again.

---

## Checklist

- [x] No `.glass` / glow / `#8338EC` on landing
- [x] Manrope only
- [x] Primary CTAs use `#630ED4`
- [x] Hero is brand-first / low-clutter (logo viewport)
- [x] Screenshots replaced by playground
- [x] Playground map is client-only (no tile/style API)
- [x] Theme toggle does not remount the playground map
- [x] Enterprise analytics not on `/`
