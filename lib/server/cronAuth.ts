import type { NextRequest } from 'next/server';
import { runtimeEnv } from '@/lib/server/runtimeEnv';

/**
 * Cron routes are called by the Supabase edge functions (which hold only the project's service
 * role key) or manually with `CRON_SECRET`. Either bearer is accepted.
 */
export function authorizeCronRequest(request: NextRequest): boolean {
  const auth = request.headers.get('authorization');
  if (!auth) return false;
  return [runtimeEnv('SUPABASE_SERVICE_ROLE_KEY'), runtimeEnv('CRON_SECRET')].some(
    (secret) => !!secret && auth === `Bearer ${secret}`,
  );
}

/**
 * Bearer for server-originated `send-push-notification` calls: the service role key, which the
 * function trusts for full-payload pushes (its own CRON_SECRET is unset). CRON_SECRET only as a
 * fallback for environments without the service key.
 */
export function cronPushBearer(): string | null {
  return runtimeEnv('SUPABASE_SERVICE_ROLE_KEY') ?? runtimeEnv('CRON_SECRET') ?? null;
}

/** `send-push-notification` URL, or null when Supabase isn't configured. */
export function pushFunctionUrl(): string | null {
  const base = runtimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  return base ? `${base}/functions/v1/send-push-notification` : null;
}
