---
name: Click Web
description: Quiet Presence — neutral, calm, content-first. Surfaces separate by tone, controls are capsules, violet is the one action color.
source: redesign spec "Quiet Presence" (2026-10-05); tokens live in app/globals.css
---

# Click Web design system: Quiet Presence

Click's web app follows the iOS app's philosophy and Luma's web craft without looking like either:

- **Tone, not lines.** Surfaces separate by background contrast. Cards have no border and no shadow at rest, and they never lift on hover. In dark mode a 1px inset hairline stands in for the missing contrast.
- **Capsules.** Buttons, chips, pills, segmented controls and toasts are pill-shaped. Content cards use `rounded-lg` (20).
- **One violet.** `--action` is the only filled color on chrome: the primary button, the selected chip, the outgoing bubble. Everything else is neutral. `--accent` is violet *text* (links, active tab).
- **Identity on the content.** Generated `CardVisual`s, chat backdrops, the 48-hour say-hi timer, Drop "develop" reveals and verified-clique language carry the brand, not the chrome.
- **Glass only where it floats.** The sticky top bar, mobile tab bar, sticky day headers, map controls and toasts use `material-glass`. Nothing else blurs.

## Tokens

Raw roles are CSS variables on `:root` / `.dark` (so MapLibre, emoji-mart and inline styles can read them). `@theme` maps them to Tailwind utilities. `__tests__/lib/ui/tokenContrast.test.ts` checks every text pair against WCAG AA in both themes.

| Role | Utility | Light | Dark |
|---|---|---|---|
| Page | `bg-bg` | #f6f6f8 | #0b0b0d |
| Elevated (sheets, popovers) | `bg-bg-elevated` | #fff | #141416 |
| Card | `bg-surface` | #fff | #1c1c1e |
| Raised (inputs, nested) | `bg-surface-raised` | #f2f2f5 | #2c2c2e |
| Subtle fill (secondary button, chip) | `bg-fill-subtle` | gray 12% | gray 24% |
| Hover wash | `bg-hover` | gray 8% | white 6% |
| Hairline | `border-hairline` | 16% | 48% |
| Text | `text-fg` | #111113 | #f5f5f7 |
| Secondary text | `text-fg-secondary` | #55555c | #aeaeb2 |
| Tertiary text (meta) | `text-fg-tertiary` | #6c6c71 | #98989f |
| Accent text | `text-accent` | #5a00c6 | #c3a6ff |
| Action fill | `bg-action` / `hover:bg-action-hover` | #7c3aed / #6d28d9 | #7c3aed / #8655f4 |
| Selection wash | `bg-selection` | #eee5ff | #24133f |
| Live | `text-live` | #e5251b | #ff453a |
| Online (dot / text) | `bg-online` / `text-online-text` | #1fa855 / #157a3e | #30d158 |
| Warning | `text-warning-text` on `bg-warning-fill` | #a34a00 / #fff1e0 | #ffb340 / #3a2600 |
| Destructive | `text-destructive` on `bg-destructive-fill` | #d70015 / #ffe5e7 | #ff453a / #3b1214 |

Dark `--action-hover` is #8655f4 rather than the spec's #8B5CF6, the nearest hue that keeps white labels at 4.5:1.

Legacy names (`primary`, `surface-container-*`, `on-surface-variant`, `outline`, `error`, …) are aliased onto these roles so untouched screens pick up the palette. Do not use them in new code; they are deleted in phase 6.

### Type

Body is the **system stack** (SF Pro / Segoe / Roboto), so there is no body-font request. **Manrope 700/800** (`font-display`) is used for titles only. Use the `type-*` utilities, never raw sizes:

| Utility | Mobile → ≥768 (size/line, weight) | Use |
|---|---|---|
| `type-display` | 34/40 → 44/48, 800 | Place / event hero titles |
| `type-title-1` | 28/34 → 34/40, 800 | Page titles |
| `type-title-2` | 24/30 → 28/34, 800 | Section titles |
| `type-title-3` | 22/28, 800 | Card titles, dialogs |
| `type-headline` | 17/24, 600 | List-row titles |
| `type-body` / `type-body-strong` | 15/22, 400 / 600 | Default text |
| `type-reading` | 16/26, 400 | Long-form (event descriptions) |
| `type-meta` | 13/18, 400 | Timestamps, captions |
| `type-badge` | 12/16, 600 | Pills, counts — the floor |

Nothing is smaller than 12px. Numbers that change use `tabular`.

### Shape, depth, motion

- Radius: `rounded-xs` 6 · `sm` 10 · `md` 14 · `lg` 20 (cards) · `xl` 26 (sheets, dialogs) · `rounded-pill`.
- Shadows: `shadow-overlay` for anything floating (menus, popovers, dialogs, toasts); `shadow-pin` for map pins. Cards have none.
- Motion: one curve, `--ease` (`cubic-bezier(.4,0,.2,1)`); `--d-press` 120 · `--d-fast` 160 · `--d-base` 240 · `--d-slow` 360. Press feedback is `.press` (scale .97). Everything honours `prefers-reduced-motion`.
- Layout: `container-narrow` 640 · `container-content` 820 · `container-page` 960 · `container-wide` 1200, with `--gutter` 16/24/32. The shell exposes `--topbar-height` (52/56) and `--tabbar-height`.
- Focus: a 2px `--accent` outline on `:focus-visible`, never removed.
- Inputs are 16px on touch devices so iOS does not zoom.

## Theme

System is the default. Settings › Appearance stores `light`/`dark` under `click-theme`; System removes the key. `THEME_BOOT_SCRIPT` (in `lib/theme/themeBoot.ts`) sets `.dark` and `<meta name="theme-color">` before paint. `useTheme()` returns `{ theme, preference, setPreference, toggleTheme }`, and maps restyle with `setStyle` in place.

## Components (`components/ds`)

Import from `@/components/ds`. No data fetching lives there.

- **Actions:** `Button` (primary · secondary · tertiary · destructive · ghost; sm 32 · md 40 · lg 48; `href` renders a link), `IconButton` (ghost · filled · glass · action), `TextLink`, `Spinner`.
- **Selection:** `Chip` / `ChipRow`, `SegmentedControl`, `LinkTabs` (URL-backed) and `Tabs`, `Toggle`, `Checkbox`, `CountBadge`.
- **Display:** `Avatar` (fallback colors match iOS `Colors.swift` via `lib/ui/avatarFallback.ts`), `GroupAvatar`, `AvatarStack`, `StatusPill`, `CardVisual`, `DateTile`, `MetaRow`, `StatTile`, `ClickMark`.
- **Containers:** `Card` / `CardLink`, `ListGroup` / `ListRow`, `SectionHeader`, `Divider`, `Timeline` / `TimelineDay`, `EventRow` (+ skeleton), `PersonRow`.
- **Overlays:** `Dialog`, `ConfirmDialog` + `useConfirm()`, `Sheet` (right drawer on desktop, bottom sheet with detents on mobile), `Menu`, `Popover`, `Tooltip` (500ms, icon buttons and truncated text only).
- **Inputs:** `TextField`, `TextArea` (auto-grows to 320), `Select`, `TitleInput`, `SearchField`.
- **Feedback:** `Skeleton` (shimmer only on media), `Loader`, `EmptyState`, `InlineNotice`, `RetryRow`, toasts via `toast` from `@/components/ds/Toast` (bottom centre glass capsule, one at a time, 3s; errors 6s and dismissible).

## Guardrails

ESLint (`eslint.config.mjs`) enforces these as errors in redesigned folders and the design system:

- No `text-[9px|10px|11px]`, no `rounded-[…]`, no `backdrop-blur` outside the glass utilities.
- No hex colors in `className` outside `components/ds` and `lib/ui`.
- No `window.confirm` / `window.alert` (a warning everywhere else).
- `maplibre-gl` is imported only through `@/lib/maps/maplibre`, which sets the worker URL. Type-only imports are fine.

## Images

`next/image` uses `lib/images/cfLoader.ts`. Supabase public objects are resized by the Supabase render endpoint (WebP, `quality=75`, `resize=cover`); static assets get `?w=` so the URL is width-keyed. Landing screenshots ship as 560px-wide WebP.
