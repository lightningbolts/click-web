# Landing — Functional Clarity (Web)

**Route:** `/` (logged-out marketing). Logged-in users mount `DashboardView` instead.  
**Files:** [`app/page.tsx`](../../app/page.tsx), [`components/landing/LandingPage.tsx`](../../components/landing/LandingPage.tsx), [`components/landing/playground/`](../../components/landing/playground/)

---

## Hero

Centered Click mark, “Click: from handshake to friendship.”, short tagline, waitlist button, and About link. Spacious neutral background follows the supplied onboarding reference. Anonymous requests still render marketing HTML on the server; authenticated visitors receive the dashboard.

## Below fold

1. **Connect without the noise** (`#why`) — neutral rounded card with the existing `consumer-add-click.png` screenshot and one short paragraph. Links to the demo.
2. **Discover real events** — violet rounded card with the existing `consumer-event-detail.png` screenshot and a public `/events` link.
3. **IRL over URL** — lavender feature card using the radar image from the user-supplied design prototype. The CTA links to the demo below.
4. **Try it** (`#how-it-works`) — existing lazy-loaded interactive playground. Navbar navigation continues to target this section. Carto tiles load directly in the browser; theme changes update the map style in place.
5. **Business** — short link to `/enterprise`.
6. **Waitlist** — Fall 2026 launch and “No ads. No feed. Built at UW.”

The connection and event images are existing site assets. The IRL card displays `vibe-radar-enhanced.png` (1484 × 1060), enhanced from the user-supplied prototype with the built-in image generation tool. Prompt: isolate the radar panel, preserve its composition, and improve edge and text clarity without adding controls or marketing copy. The original `vibe-radar-prototype.png` is retained. Feature cards stack on smaller screens. The homepage no longer loads the unused presence heatmap; the Fold Map components remain available for future use.

---

## Theme

Must read correctly in light and dark via CSS tokens. Interactive accent `#7c3aed` for brand/CTAs/links/pins. Verify both after restyle. Toggling the Navbar theme while the playground map is open must not remount MapLibre or `fitBounds` again (Carto `setStyle` in place).

---
