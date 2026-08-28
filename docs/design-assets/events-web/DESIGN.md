# Events on web

Public event surfaces on click-web — list (`/events`), create (`/events/new`), and detail (`/e/{id}`) — share one layout language: Functional Clarity tokens, `CardVisualHero`, and a single page column that lines up with Navbar and Footer.

This document is web-only. Mobile Functional Clarity (neo-brutalist 2px borders) stays in [`click/docs/design-assets/functional_clarity/DESIGN.md`](../../../click/docs/design-assets/functional_clarity/DESIGN.md). Do not copy that border language onto web.

## Brand

Keep both brand colors. Do not retire blue.

| Token | Hex | Events use |
|-------|-----|------------|
| Primary | `#630ed4` | Filled CTAs (`Open in Click`, `Create event`, `RSVP`) |
| Secondary | `#224cff` | Info icons and links (calendar, pin, maps, copy) |
| Light background / surface | `#f9f9f9` / `#ffffff` | Default theme |
| Dark background / surface | `#0B0A10` / `#15121C` | `.dark` only; light mode stays |

Events are not dark-only. Semantic classes (`bg-background`, `bg-surface`, `text-on-surface`, `border-border-hard`) follow the site theme toggle.

## Type

- Body / UI: Manrope (`font-sans`)
- Event titles only: Source Serif 4 (`font-display`) — create headline, featured list title, detail hero

## Page width

All event routes use `EventPageShell`:

- Inner column: `mx-auto w-full max-w-6xl` (same as Navbar / Footer)
- Horizontal padding: `px-4 md:px-10` (Navbar, not About/Footer `px-6 md:px-12`)
- Vertical padding is page-specific (`py-8` / `py-10`)

Create’s split pane and Detail’s two-column layout live **inside** that 6xl column. Do not nest a second `max-w-2xl` page wrapper. Description copy may use `max-w-prose` for line length.

Covered routes: `/events`, `/events/new`, `/e/{id}`, `/e/{id}/manage`, `/e/{id}/recap`, `/e/{id}/summary`.

## Surfaces

**List** — search, date/going/host chips, featured first-upcoming hero, then Today / This week / Upcoming. Cards: 72–96px `CardVisualHero`, **when** first, then title, location, host, avatar stack + count. Missing time is muted `Time TBD`. Empty location is omitted.

**Create** — desktop two-column (cover + theme swatches | title/description/schedule/location/options). Custom date + 12h time + timezone chip. Event options: visibility, capacity, approval, guest-list visibility, show name, venue scale, categories. Location “Use my location” is an icon on the input. Submit is a full-width primary button.

**Detail** — hero + info card + sticky RSVP. Host avatar opens the profile modal when signed in, else `/c/{id}`. Guest avatars open the directory when `guest_list_visibility` allows. One primary CTA: `click://e/{id}` (“Open in Click”) with store links as text underneath. Copy link is an icon control.

## Cover visuals

Default seed is the raw `beacon.id` so list, detail, and mobile match. `cover_theme_id` (`theme:purple` …) is an optional override passed to `CardVisualHero` as `visualSeed`.
