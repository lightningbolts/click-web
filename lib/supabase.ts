import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authCookieOptions } from '@/lib/auth/cookieDomain';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your-project-url.supabase.co') {
    console.error('Supabase credentials not configured');
    return null;
  }

  supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    // Same `Domain` the server writes, or a token refresh here would leave a second,
    // host-only copy of the session cookie.
    cookieOptions: authCookieOptions(typeof window === 'undefined' ? null : window.location.hostname),
    auth: {
      flowType: 'pkce',
      // Auth callbacks are handled by /api/auth/callback on the server.
      detectSessionInUrl: false,
      persistSession: true,
    },
  });

  return supabaseInstance;
}

