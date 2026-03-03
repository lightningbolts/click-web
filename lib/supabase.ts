import { createBrowserClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Only create client if both values are properly set
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your-project-url.supabase.co') {
    console.error('Supabase credentials not configured');
    return null;
  }

  // Use implicit flow: recovery tokens land in the URL hash fragment, not as
  // a ?code= query param.  Hash fragments are never sent to the server, so
  // there is no code_verifier lookup against localStorage — which means the
  // link works even when opened in a different browser or an incognito tab.
  supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return supabaseInstance;
}

