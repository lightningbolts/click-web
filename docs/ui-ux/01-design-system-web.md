# Design System — Functional Clarity (Web)

**Visual system:** Neo-brutalist Functional Clarity — opaque surfaces, 2px hard borders, primary `#630ed4`, no glass/blur/gradients.  
**Mobile source of truth:** [`click/docs/design-assets/functional_clarity/DESIGN.md`](../../../click/docs/design-assets/functional_clarity/DESIGN.md), [`Color.kt`](../../../click/composeApp/src/commonMain/kotlin/compose/project/click/click/ui/theme/Color.kt)  
**Web tokens:** [`app/globals.css`](../../app/globals.css) — use `@theme` (not `@theme inline`) so light/dark can override `--color-*` at runtime.  
**Primitives:** [`components/fc/`](../../components/fc/)  
**Theme:** [`lib/theme/ThemeProvider.tsx`](../../lib/theme/ThemeProvider.tsx)

---

## Principles

1. De-AI-ified — no ethereal gradients, synthetic glows, glassmorphism, or neon text-shadow.
2. Neo-brutal + modern minimal — solid fills, heavy Manrope hierarchy, modular bordered panels.
3. Hard edges — 2px structural borders; no soft elevation shadows on product chrome.
4. Primary purple only — `#630ED4` for brand/CTA/active.
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
| `background` | `#f9f9f9` | `#101212` |
| `surface` | `#ffffff` | `#1a1c1c` |
| `surface-container` | `#eeeeee` | `#242626` |
| `on-surface` | `#1a1c1c` | `#f0f1f1` |
| `on-surface-variant` | `#4a4455` | `#d6d9d9` |
| `border-hard` | `#000000` | `#ffffff` |
| `error` | `#ba1a1a` | `#ba1a1a` |

Shape: button radius `8px`, card radius `16px`, border width `2px`.

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
| `FcCard` | Opaque surface, 2px hard border, 16px radius |
| `FcButton` | Primary solid / secondary bordered |
| `FcChip` | Solid container chip |
| `FcInput` | Hard-bordered field |
| `FcPageShell` | Flat background page wrapper |
| `FcSectionHeader` | Oversized headline + muted support line |

---

## Legacy → Functional Clarity mapping

| Legacy | Replace with |
|--------|----------------|
| `#8338EC`, `#3A86FF` | `--primary` `#630ed4` |
| `.glass`, `.glass-panel`, `GlassPanel` | `FcCard` / `.fc-card` |
| `.glow-violet`, `.glow-blue`, `.text-neon-*` | Remove |
| `.text-gradient`, `.gradient-border` | Solid `on-surface` / `primary` |
| `backdrop-blur`, glass modals | Opaque `surface` + hard border |
| Space Grotesk / `.font-heading` | Manrope / bold weight |
| `bg-zinc-950`, `#121212` | `bg-background` |
| `border-zinc-800`, `border-white/10` | `border-border-hard` (2px) |

---

## Do / don’t

**Do:** use CSS variables and `Fc*` primitives; keep web density for tables/charts; switch MapLibre light/dark styles with theme.

**Don’t:** reintroduce glass, dual neon accents, gradient text, or a second palette forked from mobile.
