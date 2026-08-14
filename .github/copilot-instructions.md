# Copilot / AI Agent Instructions for click-web

Purpose: Provide focused, actionable guidance so an AI coding agent can be immediately productive in this Next.js App Router project.

- **Project type:** Next.js 16 (App Router), TypeScript, Tailwind CSS, Framer Motion, Supabase. Entry: [app/layout.tsx](app/layout.tsx).
- **Run/dev commands:** `npm run dev` (Next dev), `npm run build`, `npm start`. See [package.json](package.json).

Key areas to inspect first
- App entry & routing: [app/](app/) — App Router with `layout.tsx`, `page.tsx`, and nested routes (e.g., `connect/[userId]/page.tsx`). Treat `app/` files as server components by default.
- API route handlers: [app/api/**/route.ts](app/api) — Next.js Route Handlers (HTTP functions). Use these for server-side Supabase interactions.
- Auth and Supabase: `lib/supabase.ts` and `lib/AuthContext.tsx` — Supabase client setup and React Auth context live here. Prefer using `app/api` server routes for secret or server-side calls.
- UI components: `components/` and `components/dashboard/` — reusable UI lives here (e.g., `ConnectionMap.tsx`, `QRIdentityCard.tsx`, `StatsOverview.tsx`). Many components are client components (look for `"use client"`).
- Styles: `app/globals.css`, Tailwind v4 via `postcss.config.mjs` and `tailwindcss` devDependency.

Patterns & conventions (repo-specific)
- App Router server/client split: Assume server components unless file uses `"use client"`. Client components use React hooks, Framer Motion, or browser-only libs (e.g., `maplibre-gl`).
- Data flow: Server components or API route handlers fetch from Supabase or other services; client components call `app/api/*` endpoints (or use `swr`) for live data. Example: `app/api/insights/venue/route.ts` exposes insights endpoints.
- Auth flows: Authentication is mediated via Supabase and route handlers under `app/api/auth/*`. Inspect `app/api/auth/callback/route.ts` for OAuth callback patterns.
- Maps & visualizations: `maplibre-gl` is used in `components/dashboard/ConnectionMap.tsx` (Carto tiles + beacon APIs) and `components/landing/playground/PlaygroundMap.tsx` (Carto tiles in the browser, no `/api/map`, lazy via `PlaygroundMapLazy`). Keep those imports in client components. Never proxy playground tiles through the Worker.

Developer workflows & checks
- Local dev: `npm run dev` to start Next dev on default port. Use browser to verify pages under `app/`.
- Build: `npm run build` then `npm start` for a production server. CI should run `npm run build` to catch SSR/type issues.
- DB bootstrap: `supabase-setup.sql` contains schema/setup hints for local Supabase instances.

When making changes
- Keep edits minimal and local to a feature unless refactor is requested. Respect `app/` server/client boundaries: move browser-only code behind `"use client"` and avoid server-only imports in client components.
- For API work, add or update `app/api/*/route.ts`. Route handlers follow Next.js handler signatures (export functions for GET/POST). Use `lib/supabase.ts` for server-side Supabase initialization.
- For UI, mirror existing component patterns: small, focused components in `components/`, grouped subcomponents in `components/dashboard/`.

Helpful concrete examples
- To add a new server endpoint: create `app/api/myfeature/route.ts` exporting `GET`/`POST`; call `lib/supabase.ts` for DB operations.
- To add a map-based client widget: create a component with `"use client"` and import `maplibre-gl` dynamically if SSR errors occur.
- To update auth UI: check `lib/AuthContext.tsx` then call relevant `app/api/auth/*` endpoints rather than using Supabase client directly in pages.

Files to reference when coding or debugging
- App routes & layouts: [app/layout.tsx](app/layout.tsx), [app/page.tsx](app/page.tsx)
- API handlers: [app/api](app/api)
- Supabase & auth: [lib/supabase.ts](lib/supabase.ts), [lib/AuthContext.tsx](lib/AuthContext.tsx)
- Key UI components: [components/dashboard/ConnectionMap.tsx](components/dashboard/ConnectionMap.tsx), [components/QRIdentityCard.tsx](components/QRIdentityCard.tsx)
- DB bootstrap: [supabase-setup.sql](supabase-setup.sql)

Notes for the agent
- Do not assume client-side runtime in `app/` files unless `"use client"` is present. If a change introduces browser APIs into a server component, split into a client child.
- Avoid changing global layout/styling without confirming scope — layout touches many pages.
- Prefer using existing API routes and `lib/supabase.ts` for server-side DB/auth changes to keep secrets out of client bundles.

If anything is ambiguous, ask: which environment (dev/prod) should code be validated against, and do you want changes committed or just suggested patches?
