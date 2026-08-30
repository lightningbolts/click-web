---
target: logged-out landing /
total_score: 18
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 3
timestamp: 2026-08-30T03-55-57Z
slug: components-landing-landingpage-tsx
---
# Critique: logged-out landing (`components/landing/LandingPage.tsx`)

Persuade surface. Job: prove digital handshake, then Join the Waitlist. Composition: Fold Map (approved `assigned.webp`). Visual world: Functional Clarity.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Waitlist has Joining… / success / error. Map load is a silent `#ebeef1` wash. Pins never explain themselves. Waitlist modal (`z-50`) sits under navbar (`z-[99999]`), so Login remains live during conversion. |
| 2 | Match System / Real World | 2 | “Why Click exists” is vernacular. Hero is metaphor. “Proximity Tap,” “inaudible audio,” “Memory Box” are lab language. Handshake is a slogan on a map, not a room. |
| 3 | User Control and Freedom | 2 | Overlay dismiss exists. No Escape on WaitlistModal (LoginModal has it). Overlay click clears the email. Focus can escape into Login. |
| 4 | Consistency and Standards | 3 | Functional Clarity holds on the plate (opaque, 1px seam, Manrope, one violet). Login and Waitlist both use `fc-btn-primary`. Playground 9px/11px labels break the 14px floor. Waitlist lacks the Escape Login already has. |
| 5 | Error Prevention | 2 | Email = `includes('@')`. Not a `<form>`. Overlay misclick is a data-loss trap. Map `maxBounds` / cooperative gestures are the real prevention. |
| 6 | Recognition Rather Than Recall | 2 | CTA is visible. Proof is not. Pins have no on-canvas meaning. Waitlist field is placeholder-only. Playground must be learned. |
| 7 | Flexibility and Efficiency | n/a | Persuade waitlist: one path. Expert accelerators would dilute the offer. |
| 8 | Aesthetic and Minimalist Design | 2 | First viewport is sparse and right. The rest of `/` is a second product (4 problems + 3 pillars + interactive app + mission reprise). |
| 9 | Error Recovery | 3 | “Enter a valid email.” Network error asks to retry. Map error tells you the offer still works. Input survives failed submit until dismiss wipes it. |
| 10 | Help and Documentation | n/a | The page is the argument. A help system is out of mode. |

**Total: 18/32 — Acceptable.** Heuristics 7 and 10 scored n/a (Persuade). A 4 would mean the first viewport already proves the handshake and the only filled button is Join the Waitlist.

Cognitive load: **7/8 checklist failures.** Logged-out navbar presents 6 choices (Events, How it works, Enterprise, About, Login, theme). Resting playground presents 8 (Connect / Events / Dashboard + five app tabs). Hero plate itself is 2 (Waitlist, About).

## Design Specificity Verdict

**LLM assessment:** Authored for Click, not category-interchangeable — with a first-read caveat. Full-bleed Carto Seattle, six sparse violet presence dots, one opaque 16px plate, Click mark, Manrope, a single violet switch, no feed. A dating app or generic “local events” waitlist could not drop this in unchanged. Below-fold pain copy (follow-back void, handle handoff, a name without a where) is specifically Click’s enemy: the follow, not the stranger.

The caveat is the first five seconds of copy. “Click: from handshake to friendship.” + “Stop scrolling. Start living.” on a city map still reads as a Seattle launch slogan. The mechanism — phones corroborate the same room, graph is verified, this is not a feed — is not on the plate. Structure is Click. Proof is delayed.

**Deterministic scan:** CLI `detect.mjs --json` on `LandingPage.tsx`, `FoldMapHero.tsx`, `FoldMap.tsx`, `FoldMapLazy.tsx` returned `[]` (exit 0). Zero static markup hits in the four target files.

**Visual overlays:** No user-visible overlay. Mutation and `detect.js` injection succeeded in a headless Chrome session against `http://localhost:3000/` (live-server on 8400, then stopped). The detector never ran in an IDE/browser tab the user can see.

Headless console: `[impeccable] 90 anti-patterns found`. Breakdown: `ai-color-palette` 76 (73 “Purple/violet neon text on dark”, 3 cyan) — brand-token false positives, mostly SVG. Real corroboration of the design review: `undersized-ui-text` 7 and `tiny-text` 5 on playground chrome (`Home` / `Add Click` / `Clicks` / `Map` / `Settings` at 9px; `MC` at 10px; 11px body). Also `cramped-padding` 1, `nested-cards` 1, `layout-transition` 1 on `body`. CLI vs overlay mismatch is mechanical: static scan of four TSX files is clean; overlay scanned the whole live `/`, including Navbar and playground.

## Overall Impression

The Fold Map first viewport is the right composition for an anti-feed product: city as content, plate as a desk object, one offer. The page then spends that credit. Persistent filled Login fights Join the Waitlist in the same frame. The plate sells a slogan, not the handshake. Below the fold, “Try it.” is a logged-in app on a waitlist surface. The single biggest opportunity: make the first viewport the whole argument — one filled button, one proof sentence, and get the playground out of the conversion path.

## What's Working

1. **Fold Map as anti-feed.** City as content, not chrome. Sparse dots, clamped Seattle, plate as a desk object. Empty map as the missing feed is the memorable idea, and it is in the code. Matches the approved comp’s inventory (mark, handshake line, tagline, one primary, About).

2. **“Why Click exists.”** Four named failures (follow-back void, handle handoff, name without a where, apps built to scroll) are more Click-specific than the hero line. Accent on “I should actually know this person” is the right single highlight.

3. **System discipline on the plate.** Opaque surface, 16px radius, 1px `border-hard`, Click mark at 56px, `fc-btn-primary` 44px, tagline from PRODUCT.md. The world is Functional Clarity, not glass. CLI detector found nothing in the Fold Map files themselves.

## Priority Issues

### P1 — Two primaries: Navbar Login vs Join the Waitlist
- **What:** Logged-out Navbar Login uses `fc-btn-primary` (`Navbar.tsx`). Hero Join the Waitlist uses the same class. Two equal filled violets in the first viewport.
- **Why it matters:** Launch is waitlist-led. Filled Login says the product is open. Jordan will authenticate; Riley will smell a contradiction (waitlist + login). The offer plate cannot win a same-color fight with persistent chrome.
- **Fix:** Make logged-out Login a secondary plate (`fc-btn-secondary` / 1px seam). The only filled violet on `/` is Join the Waitlist (hero + close). Keep Login findable, not peer.
- **Suggested command:** `/impeccable quieter` (demote Login) or `/impeccable layout` (hierarchy of the first viewport)

### P1 — First viewport does not prove the handshake
- **What:** Plate copy is brand poetry. Pins are 14px inert dots (`tabIndex={-1}`, `cursor: default`) with `aria-label` only. Nothing on-canvas says neighborhood presence, not people, not a live graph.
- **Why it matters:** Persuade job is “verified in-person connection, anti-feed,” then waitlist. Riley leaves still able to say “Seattle startup, city map.”
- **Fix:** One proof sentence on the plate, under the tagline, in `on-surface-variant`: e.g. “Phones confirm you were in the same room. No feed.” Optionally a 14px caption on the map: “Demo neighborhood presence — not a live graph.” Do not add a second CTA.
- **Suggested command:** `/impeccable clarify`

### P1 — “Try it.” is a product, not a disclosure
- **What:** Playground dumps Connect + Events + Dashboard + five app tabs before the close. Overlay confirmed 9px tab labels (`Home`, `Add Click`, `Clicks`, `Map`, `Settings`) and 11px body — under the 14px floor. Copy promises “the same Memory Box, map, chat, and QR identity as the logged-in site” on a waitlist surface.
- **Why it matters:** Destroys single focus and peak-end. If I can already use the app, why a waitlist? Detector and design review agree here; CLI missed it because the playground is not in the four Fold Map files.
- **Fix:** Collapse to one scene (Connect / Tap in a room) *or* move playground behind How it works as opt-in, and put the Fall 2026 / UW / no-feed close much closer to the hero. Do not show five app tabs to a person who cannot sign in. If it stays, typeset the device chrome to ≥14px.
- **Suggested command:** `/impeccable distill`

### P2 — Waitlist modal fails the high-stakes moment
- **What:** `WaitlistModal` is `z-50` under navbar `z-[99999]`. No Escape, no focus trap, no `<label>`, not a `<form>` (Enter no-ops), overlay dismiss wipes the email, copy is “Leave your email and we'll reach out when we're ready.”
- **Why it matters:** Giving an email is the conversion. Chrome still works on top of it. Accidental dismiss is data loss. Reassurance (UW, no feed, Fall 2026) lives only on the last card.
- **Fix:** Raise overlay above the navbar. Trap focus. Escape. `<form>` + labelled email + `autocomplete="email"`. Persist the value on accidental dismiss or require clicking X. Repeat “No ads. No feed. Built at UW.” in the modal body. Success: what happens next, not only “we’ll be in touch.”
- **Suggested command:** `/impeccable harden`

### P2 — Secondary path is About, not the proof
- **What:** Plate secondary is About, which leaves `/`. Navbar “How it works” lands on `#how-it-works` (playground), not the handshake explanation. On-page proof is `#why`.
- **Why it matters:** The visitor who is almost convinced needs `#why`, not the company page. Comp requires About visually quiet; it does not require sending the almost-yes off-site before waitlist.
- **Fix:** Keep About visually quiet if the comp requires the word. Make the useful secondary “Why Click exists” (in-page). Do not send the almost-yes to `/about` before the waitlist.
- **Suggested command:** `/impeccable clarify`

## Persona Red Flags

Primary action: Join the Waitlist.

**Jordan (first-timer):** Sees two violet buttons. Chooses Login because it looks like “start.” If they hit Waitlist, the field has no label, Enter does nothing, and the sentence is “we’ll reach out when we’re ready” — not what Click is. “Handshake” is a metaphor; they look for a help link and get About (company) or How it works (a fake phone).

**Riley (skeptical):** Map pins do nothing. No live count, no verified-clique proof, no “this is demo presence.” Playground lets them RSVP and chat in a toy — then the close says waitlist until Fall 2026. Login exists, so the waitlist looks like a marketing gate on an already-built app. Email validation is `includes('@')`. Overlay click nukes the form. They will not submit.

**Casey (mobile / thumb):** Plate is in the thumb zone — that part is right. Navbar Login and hamburger are top-right, 36×36 (`h-9 w-9`), not 44. Modal close is smaller. Full-bleed map + cooperative gestures: the city can eat the first scroll. Playground phone is `max-w-[300px]` with 5 tabs at 9px — overlay-confirmed, unusable as a one-thumb demo.

**Avery (UW / continuing a verified connection):** PRODUCT.md’s person: met in a room, arriving via `/` to continue that relationship. U-District is a pin, but nothing says the 48-hour window or “this is the browser companion, handshake stays on the phone.” “Built at UW” is the last card. Hardware-stays-on-the-phone is not spoken, so they may think tapping on this page is the handshake.

## Minor Observations

- Comp About centered vs code left-aligned under the CTA (`items-start`).
- `shadow-lg` on the offer plate is legal (floating overlay); keep it off the below-fold cards (they are correctly flat).
- Events benefit icon is `text-on-surface-variant` while In person / Context are `text-primary`.
- Dual Click marks (nav wordmark + plate) match the comp; redundant but on-model.
- Mission section restates the tagline.
- Waitlist success can show CheckCircle plus the same sentence twice if `data.message` echoes the default.
- Theme sun/moon in `text-primary` adds another violet in the bar next to Login.
- MapLibre attribution + cooperative-gesture veil can collide with the lower-right of a mobile viewport.
- Overlay `ai-color-palette` (76) and `layout-transition` on `body` are false positives; do not chase them.

## Questions to Consider

1. If Login were invisible for five seconds, would anyone still understand they cannot “use Click” today? If the answer is no, the hero is selling a live product.
2. What if the map had zero pins and the plate said the emptiness is the point? The dots currently look like a sparse live graph. The brief says empty is correct. The build is afraid of empty.
3. Would the waitlist convert harder if “Try it.” did not exist on `/` at all? The playground is the most expensive object on the page, and it argues against the close.
