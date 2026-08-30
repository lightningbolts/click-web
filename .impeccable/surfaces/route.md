---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: ["components/landing/LandingPage.tsx"]
---

# Landing — The Fold Map

## Scope and visitor mode

Logged-out `/` only (Persuade). Authenticated visitors keep the dashboard. Job: prove the handshake as **presence in a real place**, then Join the Waitlist for the **mobile app**. The website companion is already live.

## Audience, job, action

Anonymous first-time visitor (often UW / waitlist). They must leave able to say “phones verify we were in the same room,” and they submit the waitlist for iOS/Android. Login stays in the navbar as a secondary control (the companion is live). Insights stay off `/`.

Approved comp: `.impeccable/mocks/decision/assigned.webp` (1536×1024). Seed `5738aa14`. Build path: comp.

## Chosen direction

**The Fold Map** (surface seed `5738aa14`, dealt lead). Functional Clarity is the world. Comp-led: `.impeccable/mocks/decision/assigned.webp` is law for the first viewport.

First viewport: full-bleed Carto map; violet heatmap of real handshake GPS (block-offset so nobody can be found; zoom 9–18, building); one opaque offer plate, lower-left: mark, “Click: from handshake to friendship.”, “Stop scrolling. Start living.”, proof sentence, Join the Waitlist, Why Click exists.

Do not literalize extra chrome the image invented (fake map UI, extra buttons, dark-only costume). Light default; `.dark` retints the same structure.

## Memorable moment

The city is quiet on purpose. Empty map is the missing feed, not an error.

## Untouched

PRODUCT.md facts; DESIGN.md tokens; waitlist until the **mobile** app launches; playground map rules (Carto in the browser, no Worker tiles, `setStyle` in place); auth callbacks.

## States

Map empty/sparse (correct). Waitlist closed / submitting / success / error. Light and dark. Reduced motion: map still, no entrance theatrics.

## Inventory (comp → medium)

| Region | Medium |
|---|---|
| Navbar | Existing `Navbar` |
| Basemap | MapLibre + Carto Positron/Dark Matter (lazy, `ssr: false`) |
| Presence | MapLibre heatmap of real encounter GPS, block-offset (SSR, 1h cache) |
| Offer plate | `fc-card` overlay (floating layer; overlay shadow allowed) |
| Logo | `ClickLogo` mark |
| Type / CTA | Manrope + `fc-btn-primary` |
| Below fold | Existing sections, 1px seams (no 4px accent bars) |

Sampled from approved comp (interior patches): map field ~`#EBEEF1` / `#D9E5EE` (Carto land/water, not a token to restyle); plate ~`#FBFAFE`; navbar ~white. Accent stays token `{colors.primary}` `#7C3AED` (button sample `#A87BF2` is anti-alias, not a new hue).
