import 'server-only';

type CloudflareEnvBag = Record<string, unknown> | undefined;

/** The Worker's bindings (rate limiters, Images): OpenNext's request context, else the module env. */
export function cloudflareEnv(): CloudflareEnvBag {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env?: CloudflareEnvBag };
    };
    const ctx = getCloudflareContext();
    if (ctx?.env) return ctx.env;
  } catch {
    /* local next / outside request context */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const workers = require('cloudflare:workers') as { env?: CloudflareEnvBag };
    if (workers.env) return workers.env;
  } catch {
    /* not on Workers */
  }

  return undefined;
}
