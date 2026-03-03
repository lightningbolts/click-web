// Use createClient from supabase-js directly — NOT createBrowserClient from @supabase/ssr.
// @supabase/ssr's createBrowserClient hardcodes flowType: 'pkce' AFTER spreading user
// options, silently overwriting any flowType: 'implicit' you pass. This means every call
// to resetPasswordForEmail() would include a code_challenge, causing Supabase to mint
// pkce_-prefixed tokens. Email link scanners (e.g. Proofpoint/urldefense) pre-fetch
// links, consuming the one-time PKCE token before the user clicks. Using createClient
// directly lets flowType: 'implicit' actually take effect.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

  // Implicit flow: recovery tokens land in the URL hash fragment (#access_token=…).
  // Hash fragments are never sent to servers — email link scanners cannot consume them.
  // The link works even when opened in a different browser or incognito tab because
  // there is no PKCE code_verifier stored in localStorage to look up.
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return supabaseInstance;
}

