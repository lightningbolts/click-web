import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Admin-only Supabase client (service_role).
 *
 * Security constraints:
 * - `server-only` prevents client-bundle imports.
 * - Intended for Server Components and Server Actions only.
 * - Never expose this client or key to browser code.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
