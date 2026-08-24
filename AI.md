# AI & contributor context — Click Web

This file is for **human developers** and **AI assistants** working in the Click Web (Next.js) codebase. Follow it to match existing architecture and avoid repeated mistakes.

---

## 1. Next.js paradigms (App Router)

- **Default to Server Components.** Do not add `"use client"` unless the file or subtree needs client-only APIs: React hooks, browser globals (`window`, `document`), event handlers that cannot be delegated, LiveKit client APIs, Framer Motion where it requires the client boundary, etc.
- **Prefer Route Handlers** (`app/api/.../route.ts`) for secrets (LiveKit keys, service role), token minting, and server-side Supabase operations.
- **Keep auth-sensitive redirects and cookie handling** consistent with `middleware.ts` and the existing `/api/auth/*` patterns rather than inventing parallel flows.

---

## 2. Cross-platform sync (web ↔ KMP mobile)

- **Payloads and enums must match the mobile app** for any shared contract: push notification bodies, call invite metadata, Edge Function JSON shapes, and naming (`snake_case` in payloads where the app already uses it).
- **Visual identity:** `lib/ui/generateCardVisual.ts` must stay aligned with KMP `ui/theme/CardVisual.kt` — same FNV-1a seeding, the same weighted `CardHueFamily` table (purple, blue, teal, coral, gold, magenta, green; purple is the heaviest bucket at 5/16), the same WCAG 4.5:1 scrim search, and the same pin shapes. Paint generated surfaces through `components/ui/CardVisualSurface.tsx` (`CardVisualHero`) or `lib/ui/cardVisualPattern.ts` (`cardVisualStyle` / `cardVisualStyleCss`) — the pattern layer is part of the contract, not decoration web may skip. Seed with the **raw entity id**, never a list-key prefix. Beacon photos are **optional** on both platforms and upload via `POST /api/beacons/image` (2 MB, unencrypted) to `avatars/{userId}/beacons/...` so storage RLS (`split_part(name,'/',1) = auth.uid()`) allows the INSERT before `map_beacons` is written.
- Before changing call or notification code, **locate the KMP source of truth** (e.g. comments in `lib/calls/incomingCallPushPayload.ts` reference `CallPushNotifier.kt` for `send-push-notification` / `incoming_call`).
- **Do not “simplify” web-only field names** if mobile or Edge Functions expect specific keys; extend both sides together if the contract changes.
- **Feature parity reference:** `README.md` § Cross-platform consistency, `lib/dashboard/README.md` § Cross-platform parity, `lib/connections/README.md` § Cross-platform parity. Mobile cannot be replaced for Tri-Factor initiation; web owns dashboard + B2B insights.

---

## 3. Edge Functions and CORS

- **`supabase.functions.invoke()` runs in the browser** for this app in some flows. That triggers **CORS** and often an **OPTIONS** preflight.
- **Every Edge Function invoked from the web client must:**
  - Handle **OPTIONS** and return success with suitable CORS headers for allowed origins.
  - Return consistent JSON and status codes on failure so the UI can surface errors.
- If an invoke works from curl or the mobile app but **fails only in the browser**, suspect **CORS/preflight** first, not Supabase client configuration alone.

---

## 4. Tailwind and UI language (Functional Clarity)

- **Use Functional Clarity**, shared with the mobile app: opaque surfaces, **2px hard borders**, primary **`#630ED4`**, Manrope only, no glass/blur/gradients/neon glow.
- **Tokens live in** `app/globals.css` (light + `.dark`). Prefer semantic classes (`bg-background`, `text-on-surface`, `border-border-hard`, `FcCard` / `.fc-card`) over hard-coded zinc/glass utilities.
- **Theme:** `lib/theme/ThemeProvider.tsx` + `components/ThemeToggle.tsx`. Do not reintroduce dark-only glass marketing styling.
- **Docs:** `docs/ui-ux/01-design-system-web.md` (and 02–04 for landing/dashboard/insights). Landing playground map lazy-loads Carto tiles in the browser; do not proxy tiles through the Worker or `/api/map`.
- **Use responsive Tailwind utilities** (`sm:`, `md:`, `lg:`, etc.) for layout and typography; avoid fixed desktop-only widths for primary flows.
- **Reuse FC primitives and tokens** rather than inventing a parallel visual system.

---

## 5. Auth flows and callbacks

- The web app handles **critical auth callbacks** (email verification, recovery, magic links, PKCE `code`, token-hash flows). Reference: `app/auth/callback/page.tsx` and `app/api/auth/callback/route.ts`.
- **Never replace multi-step auth UX with blind auto-redirects** without showing a **success or error state** first where the product already does so. Users must understand whether verification succeeded, failed, or expired.
- When touching redirects, validate **Supabase redirect URL allowlists** and **OTP expiry** settings; many “broken link” reports are configuration or expiry, not application bugs.

---

## 6. Hallucination guards (check before you ship)

- **Verify imports and packages** against `package.json` (e.g. LiveKit is **`livekit-client`** + **`livekit-server-sdk`** here, not assumed wrapper libraries).
- **Verify env var names** by searching `process.env` in the repo rather than guessing.
- **Verify route paths** under `app/` before documenting or linking; App Router nesting differs from Pages Router.

---

## Optional: point Cursor at this file

If your team uses Cursor project rules, add a short rule that says: “Read `click-web/AI.md` before large changes to auth, LiveKit, Supabase invokes, or shared mobile payloads.”
