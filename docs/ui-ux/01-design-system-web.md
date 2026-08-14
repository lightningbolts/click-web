# Design System — Functional Clarity (Web)

**Visual system:** Neo-brutalist Functional Clarity — opaque surfaces, 1px outline-variant borders, primary `#630ed4`, secondary `#224CFF`, no glass/blur/gradients.  
**Mobile source of truth:** [`click/docs/design-assets/functional_clarity/DESIGN.md`](../../../click/docs/design-assets/functional_clarity/DESIGN.md), [`Color.kt`](../../../click/composeApp/src/commonMain/kotlin/compose/project/click/click/ui/theme/Color.kt)  
**Web tokens:** [`app/globals.css`](../../app/globals.css) — use `@theme` (not `@theme inline`) so light/dark can override `--color-*` at runtime.  
**Primitives:** [`components/fc/`](../../components/fc/)  
**Theme:** [`lib/theme/ThemeProvider.tsx`](../../lib/theme/ThemeProvider.tsx)

Mobile Compose now matches these quiet 1dp borders and secondary `#224CFF`. Reuse `components/fc/` (`FcCard`, `FcButton`, `FcInput`, `FcTextarea`, `FcChip`) instead of one-off chrome.

---

## Principles

1. De-AI-ified — no ethereal gradients, synthetic glows, glassmorphism, or neon text-shadow.
2. Neo-brutal + modern minimal — solid fills, heavy Manrope hierarchy, modular bordered panels.
3. Quiet edges — 1px structural borders in outline-variant; no soft elevation shadows on product chrome. Keep 2px only for focus/selected primary rings.
4. Primary purple for brand/CTA/active — `#630ED4`. Secondary blue `#224CFF` for events/map emphasis, playground pins/RSVP, and non-CTA text-link hover — not a second primary button.
5. Manrope only — hierarchy via size/weight (no Space Grotesk).
6. Min 14px body/label text.
7. Depth via tone — surface tiers, not blur.

---

## Color tokens

| Token | Light | Dark |
|-------|-------|------|
| `primary` | `#630ed4` | `#630ed4` |
| `on-primary` | `#ffffff` | `#ffffff` |
| `primary-container` | `#7c3aed` | `#7c3aed` |
| `on-primary-container` | `#ede0ff` | `#ede0ff` |
| `secondary` | `#224cff` | `#224cff` |
| `on-secondary` | `#ffffff` | `#ffffff` |
| `secondary-container` | `#e8edff` | `#1a2a6e` |
| `on-secondary-container` | `#0d1f73` | `#d6e0ff` |
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
| `FcButton` | Primary solid / secondary bordered |
| `FcChip` | Solid container chip |
| `FcInput` | 16px-radius field (matches search) |
| `FcTextarea` | Same field chrome, top-aligned caret, 112px min height |
| `FcPageShell` | Flat background page wrapper |
| `FcSectionHeader` | Oversized headline + muted support line |
| Call overlay | Full-screen Grid / Speaker (`components/chat/CallOverlay.tsx`) — `bg-[#101212]`, `border border-border-hard`, primary active border; layout policy in `lib/calls/callLayoutPolicy.ts` |

---

## Legacy → Functional Clarity mapping

| Legacy | Replace with |
|--------|----------------|
| `#8338EC` | `--primary` `#630ed4` |
| `#3A86FF` | `--secondary` `#224cff` (events/map/link hover only) |
| `.glass`, `.glass-panel`, `GlassPanel` | `FcCard` / `.fc-card` |
| `.glow-violet`, `.glow-blue`, `.text-neon-*` | Remove |
| `.text-gradient`, `.gradient-border` | Solid `on-surface` / `primary` |
| `backdrop-blur`, glass modals | Opaque `surface` + quiet border |
| Space Grotesk / `.font-heading` | Manrope / bold weight |
| `bg-zinc-950`, `#121212` | `bg-background` (call chrome may use fixed `#101212`) |
| `border-zinc-800`, `border-white/10`, 2px `#000`/`#fff` | `border-border-hard` (1px outline-variant) |
| Call overlay glass / single remote track | Multi-participant Grid/Speaker + FC tokens |

---

## Do / don’t

**Do:** use CSS variables and `Fc*` primitives; keep web density for tables/charts; switch MapLibre light/dark styles with theme; use `secondary` for events, map pins, and text-link hover.

**Don’t:** reintroduce glass, neon glows, gradient text, or a second primary CTA color. Don’t fork mobile Compose tokens from this web border/accent change.
