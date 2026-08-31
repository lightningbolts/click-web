# Events on web

Public event surfaces on click-web — list (`/events`), create (`/events/new`), and detail (`/e/{id}`) — share one layout language: Functional Clarity tokens, `CardVisualHero`, and a single page column that lines up with Navbar and Footer.

This document is web-only. Mobile Functional Clarity (neo-brutalist 2px borders) stays in [`click/docs/design-assets/functional_clarity/DESIGN.md`](../../../click/docs/design-assets/functional_clarity/DESIGN.md). Do not copy that border language onto web.

## Brand

Use one interactive accent across the public site and authenticated dashboard.

| Role | Token / value | Events use |
|-------|---------------|------------|
| Interactive accent | Primary / `#7c3aed` | Filled CTAs, selected pills, text links, focus states |
| Decorative icon | On-surface variant | Calendar, pin, and other non-interactive fact icons |
| Light background / surface | `#f9f9f9` / `#ffffff` | Default theme |
| Dark background / surface | `#0B0A10` / `#15121C` | `.dark` only; light mode stays |

Blue is allowed inside generated cover artwork, but not as a control, link, status,
or informational-icon color.

Events are not dark-only. Semantic classes (`bg-background`, `bg-surface`, `text-on-surface`, `border-border-hard`) follow the site theme toggle.

## Type

- Body / UI: Manrope (`font-sans`)
- Event titles only: Source Serif 4 (`font-display`) — create headline, featured list title, detail hero

## Page width

All event routes use `EventPageShell`:

- Inner column: `PAGE_COLUMN_CLASS` (`mx-auto w-full max-w-6xl px-4 md:px-10`) — same as Navbar / Footer / Insights
- Navbar must not add a second `px-4 md:px-10` outside that column
- Vertical padding is page-specific (`py-8` / `py-10`)

Create’s split pane and Detail’s two-column layout live **inside** that 6xl column. Do not nest a second `max-w-2xl` page wrapper. Description copy may use `max-w-prose` for line length.

Covered routes: `/events`, `/events/new`, `/e/{id}`, `/e/{id}/manage`, `/e/{id}/recap`, `/e/{id}/summary`.

## Surfaces

**List** — search, date/going/host chips, featured first-upcoming hero, then Today / This week / Upcoming. An Upcoming/Past control exposes public event history. Cards use a 72–96px `CardVisualHero`, **title first**, then a muted timezone-aware date range, location, host, and avatar stack + going/went count. A missing time is shown as muted `Time TBD` only when neither canonical event-time columns nor legacy metadata contains a valid start. Empty location is omitted; the legacy placeholder `Current location` is never rendered.

**Create** — desktop two-column (cover + theme swatches | title/description/schedule/location/options). Each start/end field opens one themed date-and-time popover; timezone remains a separate chip. Event options are grouped into Visibility & Access, Capacity, Check-in area, and Categories. Boolean settings use the shared styled toggle—never a native checkbox. Location “Use my location” is an icon on the input. Submit is a full-width primary button. Cover and profile images share one validated upload client and always expose failures inline.

**Detail** — hero + info card + one sticky RSVP-status card. Host avatar opens the profile modal when signed in, else `/c/{id}`. Attendees appear exactly twice: a compact avatar summary and one expanded directory where mutual connections are marked inline. Guest avatars open the directory when `guest_list_visibility` allows. One primary row: `click://e/{id}` (“Open in Click”) plus a square copy-link control, both `h-11`. Store actions (“Get the app”, “Android”) are secondary `FcButton`s on the next row.

## Shared event primitives

- `Pill`: all filters and option choices, with one selected/unselected language.
- `Toggle`: all boolean settings.
- `AvatarStack`: attendee summaries and counts.
- `InfoRow`: icon, label, and value facts on detail/settings surfaces.
- `EventListCard`: the public and dashboard list row. Shells may differ, but title,
  date, location, and attendee formatting must not.

Date ranges must include the end date whenever the event crosses a calendar-day
boundary in its configured timezone.

## Cover visuals

Default seed is the raw `beacon.id` so list, detail, and mobile match. `cover_theme_id` (`theme:purple` …) is an optional override passed to `CardVisualHero` as `visualSeed`.
