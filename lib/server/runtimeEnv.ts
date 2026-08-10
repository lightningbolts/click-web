import 'server-only';

/**
 * Read a runtime env var on Cloudflare Workers / OpenNext.
 *
 * Dashboard "Variables and secrets" only appear on `process.env` when
 * `nodejs_compat_populate_process_env` is enabled (or compatibility_date >= 2025-04-01).
 * As a belt-and-suspenders fallback, also read Cloudflare `env` bindings via OpenNext.
 */
export function runtimeEnv(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;

  try {
    // Lazy require so local `next dev` / tests without the CF runtime still compile.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env?: Record<string, unknown> };
    };
    const value = getCloudflareContext()?.env?.[name];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  } catch {
    // Not running inside a Cloudflare request context.
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
