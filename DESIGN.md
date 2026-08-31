---
name: Click Web
description: Functional Clarity — opaque plates, one violet switch, verified identity on the content, never on the chrome.
colors:
  primary: "#7C3AED"
  on-primary: "#FFFFFF"
  primary-container: "#EDE9FE"
  on-primary-container: "#5B21B6"
  secondary: "#6D28D9"
  on-secondary: "#FFFFFF"
  secondary-container: "#F3E8FF"
  on-secondary-container: "#5B21B6"
  background: "#F9F9F9"
  surface: "#FFFFFF"
  surface-container-low: "#F3F3F4"
  surface-container: "#EEEEEE"
  surface-container-high: "#E8E8E8"
  surface-container-highest: "#E2E2E2"
  on-surface: "#1A1C1C"
  on-surface-variant: "#4A4455"
  outline: "#7B7487"
  border-hard: "#CCC3D8"
  error: "#BA1A1A"
  surface-tint: "#8B5CF6"
  inverse-primary: "#D2BBFF"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.25
rounded:
  btn: "8px"
  field: "16px"
  card: "16px"
  chip: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  page-x: "16px"
  page-x-md: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.btn}"
    padding: "10px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.btn}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.btn}"
    padding: "10px 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.btn}"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.on-primary-container}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "4px 12px"
  nav-item:
    textColor: "{colors.on-surface}"
    typography: "{typography.label}"
    rounded: "{rounded.btn}"
    padding: "0 12px"
    height: "36px"
---

# Design System: Click Web

## Overview

**Creative North Star: "Functional Clarity"**

Click Web is a neo-brutal desk, not a social atmosphere. Every chrome surface is an opaque plate. Seams are 1px outline-variant lines you can count. Depth is a stack of grey-violet tones, never blur, glass, or drop shadow on product chrome. One violet switch does all interactive work: CTAs, active nav, text links, map pins, selected pills, focus rings.

The system is de-AI-ified on purpose. It refuses ethereal gradients, synthetic glows, neon text-shadow, and dual-accent palettes. Personality lives in weight and structure: heavy Manrope, modular bordered panels, a 2px press nudge on buttons. The only sanctioned non-flat paint is **entity identity** — beacons, event covers, capsules — generated from the entity id so the same thing looks the same on map, list, and phone.

Light is the default room. Dark is the same room at night: purple-black walls, still opaque, still one switch. Marketing, dashboard, events, and insights share one page column and one navbar language so the companion never splits into a “pretty site” and an “app.”

**Key Characteristics:**
- Opaque plates, never glass
- One interactive accent (Click Violet)
- Quiet 1px seams; 2px reserved for focus and the button press
- Manrope for all UI; Source Serif 4 only on event titles
- Entity gradients through `CardVisualHero` only
- Shared `max-w-6xl` page column with the navbar

## Colors

One violet family does brand and interaction. Neutrals do the room. Error is the only other hue in chrome.

### Primary
- **Click Violet**: The only interactive accent. Filled CTAs, active nav, text links, map pins/clusters, selected pills, focus rings. Rarity is not the point — singularity is. `secondary` is the same family (deeper violet), never a second hue.
- **On Primary**: White type and icons on filled violet.
- **Primary Container / On Primary Container**: Tinted violet plates (chips, selected wells, soft highlights). Not a second accent.

### Secondary
- **Deep Violet**: Alias of the primary family for quieter filled moments. Do not use it to introduce blue, teal, or a second interactive color. Blue may appear inside generated entity artwork only.

### Neutral
- **Paper Ground** (`background`): Page wash, slightly off-white so white cards read as plates.
- **Plate** (`surface`): Card, input, and control fills.
- **Tone steps** (`surface-container-low` → `highest`): The elevation system. Stack these instead of shadow.
- **Ink / Ink Mute** (`on-surface`, `on-surface-variant`): Body and supporting copy. Minimum 14px.
- **Seam** (`border-hard`, same as outline-variant): The 1px structural border.
- **Outline**: Scrollbars, quieter rules, non-structural strokes.

Dark mode (`.dark` on `html`) retints the same roles toward purple-black. Do not invent a separate dark palette or hardcode `zinc-950`. Call chrome may use a fixed near-black plate (`#101212`) inside the overlay only.

### Named Rules
**The One Switch Rule.** Click Violet is the only interactive hue. If a control, link, pin, or selected state is not violet, it is wrong.

**The Chrome Is Not the Content Rule.** Gradients, patterns, and hue families belong on generated entity surfaces. Chrome stays flat color + 1px seam.

## Typography

**Display Font:** Source Serif 4 (Georgia / Times fallback) — event titles only
**Body Font:** Manrope (ui-sans-serif, system-ui fallback)
**Label/Mono Font:** Manrope (no mono identity)

**Character:** Manrope carries the desk — geometric, heavy, no display gimmick. Source Serif 4 is a ledger heading for named events, not a second UI face. Space Grotesk and Inter-as-display are out.

### Hierarchy
- **Display** (Source Serif 4, 600, clamp ~30–48px): Create-event headline, featured list title, event detail hero. Never landing, never nav, never insights.
- **Marketing display** (Manrope, 700, 36px / 48px at `sm:`): Landing “Click: from handshake to friendship.” Serif would costume the handshake as editorial.
- **Headline** (Manrope, 700, 32px): `FcSectionHeader` and page titles.
- **Title** (Manrope, 700, 24px): Section titles on smaller viewports, card titles.
- **Body** (Manrope, 500, 16px, relaxed leading): Default reading. Supporting lines use `on-surface-variant`.
- **Label** (Manrope, 700, 14px): Buttons, nav, chips, field labels. Floor: 14px. Do not ship 12px UI text.

### Named Rules
**The Event Serif Rule.** Source Serif 4 appears only on event titles. Everywhere else is Manrope, including the marketing hero.

**The Weight Hierarchy Rule.** There is one family for UI. Size and weight do the ranking. Do not add a second sans.

## Layout

One column for the whole product: `max-w-6xl` (1152px), `px-4` (16px) then `md:px-10` (40px), centered. Navbar, footer, dashboard, events, and insights inner wrappers all use this class. Do not pad the bar and then pad the column again.

Navbar height is `4rem` (4.5rem from 768px) so the landing hero can fill the first viewport without the next heading peeking. Vertical rhythm is an 8px grid (4 / 8 / 16 / 24 / 32). Section headers sit on `mb-6` with more space above than below.

Density: marketing is sparse and brand-first (logo as the primary viewport). Dashboard, chat, and insights are denser — tables, charts, threads — still on the same tokens. Mobile: wrapping tool nav and an animated drawer; not a persistent desktop sidebar on small screens.

Maps (Carto Positron / Dark Matter) are content, not chrome. Clamp playground maps to the product’s geographic scene; do not restyle MapLibre into glass.

## Elevation & Depth

Flat by default. Cards, inputs, nav, and buttons do not cast shadows. Depth is the surface-container ramp plus a 1px seam. Buttons do not ease or lift on hover; primary darkens slightly (`brightness(0.92)`), and both variants punch `translate(2px, 2px)` on active.

Shadows are allowed only on **floating layers** that leave the plate: menus, popovers, date pickers, map overlays. They are not a card style. Backdrop-blur and translucent `background/70` plates are drift, not the system.

### Shadow Vocabulary
- **Overlay** (menus, popovers, floating pickers): a single large shadow on an opaque `surface` plate with a 1px seam. Use the platform `shadow-lg` / `shadow-xl` utilities; do not invent glow-violet shadows.
- **None** (cards, inputs, buttons, nav, page): no shadow.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow means the object is floating above the desk (a menu), not that the card is fancy.

## Shapes

Two radii, applied by role: **8px** on buttons, nav items, and compact controls; **16px** on cards, fields, and large plates; **pill** (9999px) on chips. Do not mix a 16px button with an 8px card.

Borders are 1px `border-hard` on chrome. 2px rings exist only for focus and selected primary states (`ring-2 ring-primary`). Legacy 2px black/white neo-brutal outlines are mobile history, not web.

No clipped diagonals, no gradient borders, no squircle fashion. Entity heroes may clip to the card radius because they *are* the card’s cover, not chrome.

## Components

Primitives live in `components/fc/`. Reuse them. One-off chrome is how glass and second accents return.

### Buttons
- **Shape:** Gently squared (8px). Default hit target 44px (`h-11`). Label 14px / 700.
- **Primary:** Click Violet fill, white type, no border. Hover: brightness 0.92. Active: brightness 0.9 and a 2px down-right nudge. Disabled: 40% opacity.
- **Secondary:** Plate fill, ink type, 1px seam. Hover: one tone step down (`surface-container-low`). Same 2px nudge. No color shift to violet unless it *is* a selected/primary action.
- **Focus:** 2px primary ring. Do not use glow.

### Chips
- **Style:** Pill, 1px seam, primary-container ink in light (tinted violet mix in dark), 14px / 600, tight padding.
- **State:** Selected interactive filters should go through primary, not a new hue.

### Cards / Containers
- **Corner Style:** 16px
- **Background:** Plate (`surface`) on Paper Ground
- **Shadow Strategy:** None. See Elevation.
- **Border:** 1px seam
- **Internal Padding:** 16–24px typical; denser in tables
- **Page shell:** `FcPageShell` is a flat `background` wrapper, not a card

### Inputs / Fields
- **Style:** 16px radius (matches search), 1px seam, plate fill, 14px / 20px line-height, 44px min height. Textarea min height 112px, top-aligned caret.
- **Focus:** 2px primary ring (no glow, no underline-only fashion except the event-title display field, which is a borderless serif headline on a bottom rule).
- **Placeholder:** Ink mute.

### Navigation
- One horizontal `Navbar` for logged-out and logged-in people (`data-navbar-root="true"`). Item: 36px tall, 8px radius, 14px / 600. Active is Click Violet type, not a filled pill. Controls (theme, account) are 8px plates with a 1px seam.
- Logged-out: Events, How it works, Enterprise, About, Login. Signed-in: Memory Box, Events, Map, Chat, QR Identity, Settings, Create event, account menu.
- Insights uses `ProductAppShell` (identity row + wrapping tool nav, same page column). Hide the marketing navbar there only.
- Mobile: drawer, not a squeezed desktop bar.

### CardVisual (signature)
Generated entity identity. Seed with the **raw entity id**. Seven hue families (purple heaviest). WCAG 4.5:1 scrim behind text. At most a short chip label on the hero; title/date/location sit in structured content below. Photos optional; never hand-roll a gradient for an entity.

## Do's and Don'ts

### Do:
- **Do** use `bg-background`, `bg-surface`, `text-on-surface`, `border-border-hard`, `text-primary` / `bg-primary` (or `var(--color-primary)`).
- **Do** build with `FcCard`, `FcButton`, `FcInput`, `FcTextarea`, `FcChip`, `FcPageShell`, `FcSectionHeader`.
- **Do** keep one page column (`PAGE_COLUMN_CLASS`) shared with the navbar.
- **Do** route entity paint through `CardVisualHero` / `cardVisualStyle`, seeded with the raw id.
- **Do** ship WCAG 2.2 AA: 14px floor, 4.5:1 on generated scrims and chrome text, visible 2px focus rings, 44px primary controls.

### Don't:
- **Don't** reintroduce glass, `backdrop-blur`, neon glow, gradient text, or gradient borders on chrome.
- **Don't** add a second interactive accent (legacy blue `#224cff` / `#3A86FF`, extra purples `#8338EC` / `#630ed4` on chrome).
- **Don't** put Source Serif on landing, nav, dashboard, or insights.
- **Don't** drop shadows on cards to “add depth.”
- **Don't** invent a per-component entity gradient or seed with a list-key prefix.
- **Don't** hardcode `zinc-950` / `#121212` page chrome (call overlay `#101212` is the listed exception).
- **Don't** fork this web border/accent language back onto mobile Compose’s 2px brutal frames.
