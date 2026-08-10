import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireRuntimeEnv } from '@/lib/server/runtimeEnv';

/**
 * Admin-only Supabase client (service_role).
 *
 * Security constraints:
 * - `server-only` prevents client-bundle imports.
 * - Intended for Server Components and Server Actions only.
 * - Never expose this client or key to browser code.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  const url = requireRuntimeEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
