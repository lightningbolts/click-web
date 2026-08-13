# Personal dashboard — Functional Clarity (Web)

**Mount:** `/` when authenticated (`DashboardView`). `/dashboard` redirects.  
**File:** [`components/DashboardView.tsx`](../../components/DashboardView.tsx)  
**Modules:** [`components/dashboard/`](../../components/dashboard/)

---

## Shell

- Flat `background`; sticky tab bar = opaque `surface` + 1px outline-variant border (no backdrop-blur).
- Tabs: memory, map, chat, identity, settings.
- Active tab: solid primary underline or primary-container chip.

---

## Modules

Migrate glass panels → `FcCard`:

- Stats, QR identity, connections table, map, chat list, availability, time capsule

Accent: `#630ED4` / primary-container for brand; `#224CFF` secondary for events/map emphasis (no blue gradient avatars).

---

## Appearance

Theme is controlled from the **Navbar** toggle only. Settings does not duplicate dark/light mode.

---

## Maps

Basemap follows theme: light → Carto Positron; dark → Carto Dark Matter.

The logged-out landing playground map does **not** use this Carto stack. It uses an inline client-only MapLibre style (`components/landing/playground/playgroundMapStyle.ts`) so the marketing demo never fetches tiles or `/api/*`.
