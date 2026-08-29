# Design System — Functional Clarity (Web)

**Visual system:** Neo-brutalist Functional Clarity — opaque surfaces, 1px outline-variant borders, interactive accent `#7c3aed`, no glass/blur/gradients on chrome.
**Mobile source of truth:** [`click/docs/design-assets/functional_clarity/DESIGN.md`](../../../click/docs/design-assets/functional_clarity/DESIGN.md), [`Color.kt`](../../../click/composeApp/src/commonMain/kotlin/compose/project/click/click/ui/theme/Color.kt)  
**Web tokens:** [`app/globals.css`](../../app/globals.css) — use `@theme` (not `@theme inline`) so light/dark can override `--color-*` at runtime.  
**Primitives:** [`components/fc/`](../../components/fc/)  
**Theme:** [`lib/theme/ThemeProvider.tsx`](../../lib/theme/ThemeProvider.tsx)  
**Surfaces:** [02 landing](./02-landing.md) · [03 dashboard](./03-dashboard.md) · [04 insights](./04-insights.md) · [05 events](./05-events.md)

Mobile Compose shares these quiet 1dp borders and the same single interactive accent. Reuse `components/fc/` (`FcCard`, `FcButton`, `FcInput`, `FcTextarea`, `FcChip`) instead of one-off chrome.

---

## Principles

1. De-AI-ified — no ethereal gradients, synthetic glows, glassmorphism, or neon text-shadow.
2. Neo-brutal + modern minimal — solid fills, heavy Manrope hierarchy, modular bordered panels.
3. Quiet edges — 1px structural borders in outline-variant; no soft elevation shadows on product chrome. Keep 2px only for focus/selected primary rings.
4. **One interactive accent** — `#7C3AED` (`primary`) for brand, CTAs, active nav, text links, map pins/clusters, and selected pills. Use Tailwind `text-primary` / `bg-primary` / `border-primary` / `ring-primary`; inline HTML/CSS uses `var(--color-primary)`; raw `#7c3aed` only where APIs cannot consume classes (MapLibre paint, canvas/Recharts series, manifest `theme_color`, SSR CSS-var fallbacks). `secondary` tokens alias the purple family or neutral surfaces — never a second blue interactive accent.
5. Manrope only — hierarchy via size/weight (no Space Grotesk).
6. Min 14px body/label text.
7. Depth via tone — surface tiers, not blur.

---

## Color tokens

| Token | Light | Dark |
|-------|-------|------|
| `primary` | `#7c3aed` | `#7c3aed` |
| `on-primary` | `#ffffff` | `#ffffff` |
| `primary-container` | `#ede9fe` | `#2e1065` |
| `on-primary-container` | `#5b21b6` | `#ede9fe` |
| `secondary` | `#6d28d9` | `#6d28d9` |
| `on-secondary` | `#ffffff` | `#ffffff` |
| `secondary-container` | `#f3e8ff` | `#3b0764` |
| `on-secondary-container` | `#5b21b6` | `#ddd6fe` |
| `background` | `#f9f9f9` | `#120e18` |
| `surface` | `#ffffff` | `#1c1526` |
| `surface-container` | `#eeeeee` | `#2a2138` |
| `on-surface` | `#1a1c1c` | `#f0f1f1` |
| `on-surface-variant` | `#4a4455` | `#cfc4e0` |
| `border-hard` | `#ccc3d8` | `#4a3d5c` |
| `error` | `#ba1a1a` | `#ba1a1a` |

Shape: button radius `8px`, card radius `16px`, border width `1px`.

---

## Typography

Manrope only. Scale: display 48 / headline 32 / headline-md 24 / body-lg 18 / body-md 16 / label 14.

---

## Light / dark mode

- Modes: `light` | `dark`
- Default: light; first visit may follow `prefers-color-scheme`
- Persist: `localStorage` key `click-theme`
- Apply: `class="dark"` on `<html>`
- UI: Navbar `ThemeToggle`, Dashboard Settings switch, Insights header

---

## Primitives

| Component | Role |
|-----------|------|
| `FcCard` | Opaque surface, 1px outline-variant border, 16px radius |
| `FcButton` | Primary solid / secondary bordered; default height `h-11` (44px) to match copy/icon controls |
| `FcChip` | Solid container chip |
| `FcInput` | 16px-radius field (matches search) |
| `FcTextarea` | Same field chrome, top-aligned caret, 112px min height |
| `FcPageShell` | Flat background page wrapper |
| `FcSectionHeader` | Oversized headline + muted support line |
| Call overlay | Full-screen Grid / Speaker (`components/chat/CallOverlay.tsx`) — `bg-[#101212]`, `border border-border-hard`, primary active border; layout policy in `lib/calls/callLayoutPolicy.ts` |
| `ProductAppShell` | Signed-in product chrome: full-height sidebar (desktop) + drawer (mobile). Used by the personal dashboard and Insights. |

---

## Product vs marketing chrome

Signed-in product routes (`/` dashboard, `/dashboard`, `/insights/*`) use [`ProductAppShell`](../../components/shell/ProductAppShell.tsx): opaque `surface` sidebar, 1px `border-hard`, active item `bg-primary-container text-on-primary-container`. The marketing [`Navbar`](../../components/Navbar.tsx) is hidden on those routes (`data-navbar-root="true"` stays on the shell’s mobile header so call overlay offset still works). Logged-out marketing pages keep the top Navbar with grouped links, active states, and a primary Login CTA.

---

## Legacy → Functional Clarity mapping

| Legacy | Replace with |
|--------|----------------|
| `#8338EC`, `#630ed4` | `--color-primary` `#7c3aed` |
| `#224cff`, `#3A86FF` | Remove from interactive chrome; decorative entity gradients may still include blue stops via `generateCardVisual.ts` |
| `.glass`, `.glass-panel`, `GlassPanel` | `FcCard` / `.fc-card` |
| `.glow-violet`, `.glow-blue`, `.text-neon-*` | Remove |
| `.text-gradient`, `.gradient-border` | Solid `on-surface` / `primary` |
| `backdrop-blur`, glass modals | Opaque `surface` + quiet border |
| Space Grotesk / `.font-heading` | Manrope / bold weight |
| `bg-zinc-950`, `#121212` | `bg-background` (call chrome may use fixed `#101212`) |
| `border-zinc-800`, `border-white/10`, 2px `#000`/`#fff` | `border-border-hard` (1px outline-variant) |
| Call overlay glass / single remote track | Multi-participant Grid/Speaker + FC tokens |

---

## Generated entity visuals (the one sanctioned gradient)

Chrome has no gradients. **Content identity does**, and it is the single exception: every surface that represents a specific entity (map beacon popup, profile Beacons tab row and detail header, Time Capsule chapter, avatar fallback) paints a deterministic gradient + pattern derived from that entity's id.

| Piece | Where |
|-------|-------|
| Generator (must mirror KMP `ui/theme/CardVisual.kt`) | `lib/ui/generateCardVisual.ts` |
| Pattern CSS + inline-style helpers | `lib/ui/cardVisualPattern.ts` — `cardVisualStyle` (React) / `cardVisualStyleCss` (imperative popup HTML) |
| Component | `components/ui/CardVisualSurface.tsx` — `CardVisualHero` |

Rules:

- **Seed with the raw entity id** (`beacon.id`), never a list-key prefix like `saved-${id}`, or the same beacon will look different in a list than on its pin.
- **Never hand-roll a gradient** for an entity (no `hsl()` from a label hash, no hardcoded `linear-gradient(#7c3aed, #224cff)`). Go through `cardVisualStyle` / `CardVisualHero` so the pattern layer and the contrast scrim come along.
- The palette is **seven hue families** (purple, blue, teal, coral, gold, magenta, green) with purple as the heaviest bucket. It is *not* the chrome accent ratio; do not re-couple them.
- `contentScrim` is chosen by a **WCAG 4.5:1 search** against every gradient stop. Always render it behind text on a generated surface.
- **A hero band is decorative.** `CardVisualHero` renders at most a short `chipLabel`; title, date, and location belong to the structured content below, never both.

---

## Do / don’t

**Do:** use CSS variables and `Fc*` primitives; keep web density for tables/charts; switch MapLibre light/dark styles with theme; use `primary` (`#7c3aed`) for all interactive accent; route entity gradients through `CardVisualHero` / `cardVisualStyle`.

**Don’t:** reintroduce glass, neon glows, gradient text, hardcoded legacy purple/blue on chrome, or a second interactive accent. Don’t fork mobile Compose tokens from this web border/accent change. Don’t invent a per-component gradient for an entity, and don’t repeat a hero's title in the content below it.
