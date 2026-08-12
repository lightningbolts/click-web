# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Click Web is a Next.js 16 (App Router) dashboard for the Click social platform. Single-package repo (not a monorepo). See `README.md` for full feature overview and `AI.md` for contributor conventions.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (port 3000) |
| Build | `npm run build` |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) |
| Lint | `npm run lint` (ESLint `next/core-web-vitals`) |
| Tests | `npm test` |
| Watch tests | `npm run test:watch` |

### Non-obvious setup notes

- **`.npmrc` has `legacy-peer-deps=true`** — required because `@emoji-mart/react` declares peer deps for React 16–18 only. `npm install` respects this automatically.
- **`@testing-library/dom`** is a required peer dependency of `@testing-library/react` and is listed in `devDependencies`. If tests fail with "Cannot find module '@testing-library/dom'", run `npm install`.
- **No `.env.local` is committed.** The app starts and builds without Supabase credentials; the client returns `null` and API routes log a warning. Features requiring Supabase (auth, chat, connections, insights) will not function without valid credentials, but the landing page, about, privacy, terms, and enterprise pages all render.
- **Root `/` must SSR marketing for anonymous requests.** `app/page.tsx` is a Server Component that chooses `LandingPage` vs `HomeAuthenticated` from the cookie session. Do not reintroduce a client `useAuth().loading` → `LoadingScreen` gate on the anonymous path — that hid all marketing copy from crawlers (issue #58 §1.4).
- **LiveKit and Stripe** are optional external services. Calling and billing features require their respective env vars (see `README.md`).
- **Dashboard route (`/dashboard`) redirects to home** when there is no authenticated session, which is expected behavior without Supabase credentials.
- **Turbopack root override** in `next.config.ts` (`turbopack.root: process.cwd()`) exists to prevent lockfile resolution issues. Do not remove it.
- **React Compiler** is enabled (`reactCompiler: true` in `next.config.ts`). The `babel-plugin-react-compiler` dev dependency supports this.
- **`supabase/` in this repo is the source of truth** for shared Postgres migrations and `bind-proximity-connection`. The mobile (`click`) repo mirrors a subset; sync/drift scripts live there.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
