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
 * Read a runtime env var on Cloudflare Workers / OpenNext.
 *
 * Order:
 * 1. `process.env` (populated when `nodejs_compat_populate_process_env` is on)
 * 2. OpenNext `getCloudflareContext().env`
 * 3. `cloudflare:workers` importable `env` (Workers runtime)
 */
export function runtimeEnv(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: (options?: { async?: boolean }) => {
        env?: CloudflareEnvBag;
      };
    };
    const fromContext = readBinding(getCloudflareContext({ async: false })?.env, name);
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
