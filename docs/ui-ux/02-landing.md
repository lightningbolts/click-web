# Landing — Functional Clarity (Web)

**Route:** `/` (logged-out marketing). Logged-in users mount `DashboardView` instead.  
**Files:** [`app/page.tsx`](../../app/page.tsx), [`components/landing/`](../../components/landing/)

---

## Hero (first viewport)

- Brand wordmark at hero scale (`Click` in `#630ED4`).
- One headline (solid `on-surface` / selective primary) — no gradient fills.
- One supporting sentence.
- One primary CTA (`FcButton` primary) + secondary login text control.
- One dominant product visual (screenshot frames with hard borders).

**Remove:** “In the works” glass pill, purple blur orbs, glow CTAs, competing neon pill stacks.

---

## Below fold

Keep content IA; restyle chrome:

- Feature grid, bento screenshots, partner dashboard showcase, web screens carousel
- Opaque bordered modules; one purpose + one headline per section
- Motion: 2–3 intentional entrances only (no perpetual neon pulse)

---

## Theme

Must read correctly in light and dark via CSS tokens. Verify both after restyle.

---

## Checklist

- [ ] No `.glass` / glow / `#8338EC` / `#3A86FF` on landing
- [ ] Manrope only
- [ ] Primary CTAs use `#630ED4`
- [ ] Hero passes brand-first / low-clutter rules
