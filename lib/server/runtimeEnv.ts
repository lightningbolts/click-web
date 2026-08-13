import 'server-only';

type CloudflareEnvBag = Record<string, unknown> | undefined;

function readBinding(env: CloudflareEnvBag, name: string): string | undefined {
  if (!env) return undefined;
  const value = env[name];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/**
 * Next.js replaces *static* `process.env.NEXT_PUBLIC_*` accesses with build-time
 * literals. Dynamic `process.env[name]` does **not** see those inlined values, which
 * made `runtimeEnv('NEXT_PUBLIC_SUPABASE_URL')` return undefined in production even
 * when `process.env.NEXT_PUBLIC_SUPABASE_URL` was present (see /api/health/env).
 */
function readStaticProcessEnv(name: string): string | undefined {
  switch (name) {
    case 'NEXT_PUBLIC_SUPABASE_URL':
      return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
    case 'NEXT_PUBLIC_SUPABASE_ANON_KEY':
      return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined;
    case 'NEXT_PUBLIC_BASE_URL':
      return process.env.NEXT_PUBLIC_BASE_URL?.trim() || undefined;
    case 'SUPABASE_SERVICE_ROLE_KEY':
      return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
    case 'STRIPE_SECRET_KEY':
      return process.env.STRIPE_SECRET_KEY?.trim() || undefined;
    case 'STRIPE_WEBHOOK_SECRET':
      return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
    case 'STRIPE_PRICE_ID':
      return process.env.STRIPE_PRICE_ID?.trim() || undefined;
    case 'GOOGLE_CLIENT_ID':
      return process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
    case 'GOOGLE_CLIENT_SECRET':
      return process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
    case 'LIVEKIT_API_KEY':
      return process.env.LIVEKIT_API_KEY?.trim() || undefined;
    case 'LIVEKIT_API_SECRET':
      return process.env.LIVEKIT_API_SECRET?.trim() || undefined;
    case 'LIVEKIT_WS_URL':
      return process.env.LIVEKIT_WS_URL?.trim() || undefined;
    case 'LIVEKIT_URL':
      return process.env.LIVEKIT_URL?.trim() || undefined;
    default:
      return undefined;
  }
}

/**
 * Read a runtime env var on Cloudflare Workers / OpenNext.
 *
 * Order:
 * 1. Static `process.env.NAME` (Next inlining + OpenNext request env)
 * 2. Dynamic `process.env[name]` (Worker-populated secrets)
 * 3. OpenNext `getCloudflareContext().env`
 * 4. `cloudflare:workers` importable `env`
 */
export function runtimeEnv(name: string): string | undefined {
  const fromStatic = readStaticProcessEnv(name);
  if (fromStatic) return fromStatic;

  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: (options?: { async?: boolean }) => {
        env?: CloudflareEnvBag;
      };
    };
    // Prefer sync context (request handlers). Do not force `{ async: false }` only —
    // some OpenNext versions expose env on the default call.
    const ctx = getCloudflareContext();
    const fromContext = readBinding(ctx?.env, name);
    if (fromContext) return fromContext;
  } catch {
    // Outside Cloudflare request context / local next without adapter.
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const workers = require('cloudflare:workers') as { env?: CloudflareEnvBag };
    const fromWorkers = readBinding(workers.env, name);
    if (fromWorkers) return fromWorkers;
  } catch {
    // Not available outside the Workers runtime.
  }

  return undefined;
}

export function requireRuntimeEnv(name: string): string {
  const value = runtimeEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Presence check only — never returns secret values. */
export function runtimeEnvPresent(name: string): boolean {
  return Boolean(runtimeEnv(name));
}
