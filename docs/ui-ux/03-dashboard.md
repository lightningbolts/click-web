# Personal dashboard — Functional Clarity (Web)

**Mount:** `/` when authenticated (`DashboardView`). `/dashboard` redirects.  
**File:** [`components/DashboardView.tsx`](../../components/DashboardView.tsx)  
**Modules:** [`components/dashboard/`](../../components/dashboard/)

---

## Shell

- Flat `background`; sticky tab bar = opaque `surface` + 2px hard border (no backdrop-blur).
- Tabs: memory, map, chat, identity, settings.
- Active tab: solid primary underline or primary-container chip.

---

## Modules

Migrate glass panels → `FcCard`:

- Stats, QR identity, connections table, map, chat list, availability, time capsule

Accent: `#630ED4` / primary-container (no blue gradient avatars).

---

## Appearance

Settings tab includes a **Dark mode** switch bound to `ThemeProvider` (same as Navbar toggle).

---

## Maps

Basemap follows theme: light → Carto Positron; dark → Carto Dark Matter.
