import 'server-only';

import { cloudflareEnv } from '@/lib/server/cloudflareEnv';

type RateLimitBinding = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

function getRateLimitBinding(name: string): RateLimitBinding | null {
  const env = cloudflareEnv();
  const binding = env?.[name];
  if (
    binding &&
    typeof binding === 'object' &&
    typeof (binding as RateLimitBinding).limit === 'function'
  ) {
    return binding as RateLimitBinding;
  }
  return null;
}

/** Process-local fallback for `next dev` / CI when Workers bindings are absent. */
const memoryStores = new Map<string, Map<string, number[]>>();

function memoryLimitExceeded(
  storeName: string,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  let store = memoryStores.get(storeName);
  if (!store) {
    store = new Map();
    memoryStores.set(storeName, store);
  }
  const now = Date.now();
  const windowStart = now - windowMs;
  let stamps = store.get(key) ?? [];
  stamps = stamps.filter((t) => t > windowStart);
  if (stamps.length >= limit) {
    store.set(key, stamps);
    return true;
  }
  stamps.push(now);
  store.set(key, stamps);
  if (store.size > 50_000) {
    for (const [k, ts] of store) {
      const recent = ts.filter((t) => t > windowStart);
      if (recent.length === 0) store.delete(k);
      else store.set(k, recent);
    }
  }
  return false;
}

/**
 * Sliding / token-bucket style check.
 * Prefers Cloudflare Workers Rate Limiting bindings (shared across isolates in a
 * colo); falls back to in-memory Maps for local Next.js.
 */
export async function isRateLimited(options: {
  bindingName: string;
  key: string;
  /** Used only by the in-memory fallback. */
  limit: number;
  /** Used only by the in-memory fallback (ms). Binding period is configured in wrangler. */
  windowMs: number;
}): Promise<boolean> {
  const binding = getRateLimitBinding(options.bindingName);
  if (binding) {
    const { success } = await binding.limit({ key: options.key });
    return !success;
  }
  return memoryLimitExceeded(
    options.bindingName,
    options.key,
    options.limit,
    options.windowMs,
  );
}

export const CONNECTIONS_RATE_LIMIT_BINDING = 'CONNECTIONS_RATE_LIMITER';
export const READ_HEAVY_RATE_LIMIT_BINDING = 'READ_HEAVY_RATE_LIMITER';
export const HUB_MESSAGE_RATE_LIMIT_BINDING = 'HUB_MESSAGE_RATE_LIMITER';
export const HUB_UPLOAD_RATE_LIMIT_BINDING = 'HUB_UPLOAD_RATE_LIMITER';
/** Shared by the post-9/29 feature writes (drops, beacon reactions, nudges); keyed per feature + user. */
export const FEATURE_MUTATION_RATE_LIMIT_BINDING = 'FEATURE_MUTATION_RATE_LIMITER';

export const CONNECTIONS_RATE_LIMIT = 10;
export const CONNECTIONS_RATE_WINDOW_MS = 60_000;
export const READ_HEAVY_RATE_LIMIT = 60;
export const READ_HEAVY_RATE_WINDOW_MS = 60_000;
export const HUB_MESSAGE_RATE_LIMIT = 30;
export const HUB_UPLOAD_RATE_LIMIT = 6;
export const HUB_MUTATION_RATE_WINDOW_MS = 60_000;
export const FEATURE_MUTATION_RATE_LIMIT = 30;
export const FEATURE_MUTATION_RATE_WINDOW_MS = 60_000;

/** 429 when `userId` exceeds the shared feature-write budget for `feature`, else null. */
export async function featureMutationRateLimitResponse(
  feature: string,
  userId: string,
): Promise<Response | null> {
  const limited = await isRateLimited({
    bindingName: FEATURE_MUTATION_RATE_LIMIT_BINDING,
    key: `${feature}:${userId}`,
    limit: FEATURE_MUTATION_RATE_LIMIT,
    windowMs: FEATURE_MUTATION_RATE_WINDOW_MS,
  });
  if (!limited) return null;
  return Response.json(
    { error: 'Too many requests. Please wait a moment and try again.', code: 'rate_limited' },
    { status: 429 },
  );
}
