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
| Tests | `npm test` |
| Watch tests | `npm test:watch` |

### Non-obvious setup notes

- **`.npmrc` has `legacy-peer-deps=true`** — required because `@emoji-mart/react` declares peer deps for React 16–18 only. `npm install` respects this automatically.
- **`@testing-library/dom`** is a required peer dependency of `@testing-library/react` and is listed in `devDependencies`. If tests fail with "Cannot find module '@testing-library/dom'", run `npm install`.
- **No `.env.local` is committed.** The app starts and builds without Supabase credentials; the client returns `null` and API routes log a warning. Features requiring Supabase (auth, chat, connections, insights) will not function without valid credentials, but the landing page, about, privacy, terms, and enterprise pages all render.
- **LiveKit and Stripe** are optional external services. Calling and billing features require their respective env vars (see `README.md`).
- **Dashboard route (`/dashboard`) redirects to home** when there is no authenticated session, which is expected behavior without Supabase credentials.
- **Turbopack root override** in `next.config.ts` (`turbopack.root: process.cwd()`) exists to prevent lockfile resolution issues. Do not remove it.
- **React Compiler** is enabled (`reactCompiler: true` in `next.config.ts`). The `babel-plugin-react-compiler` dev dependency supports this.
- **Restarting the dev server is required after creating/changing `.env.local`** — Next.js does not hot-reload environment variable changes. Kill the `npm run dev` process and restart it.
- **Waitlist API (`POST /api/waitlist`)** works even without Supabase — it logs the email and returns success. With Supabase connected it inserts into the `waitlist` table. This is a good smoke-test endpoint.
- **`.env.local` must be created manually** from secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The `.gitignore` already excludes `.env*.local`.
