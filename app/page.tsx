import { createSupabaseServerClient } from '@/lib/server/supabaseServer';
import HomeAuthenticated from '@/components/HomeAuthenticated';
import LandingPage from '@/components/landing/LandingPage';
import type { User } from '@supabase/supabase-js';

/**
 * Root route: resolve the cookie session on the server so anonymous crawlers
 * receive marketing HTML (not LoadingScreen). Logged-in users get the dashboard
 * without a marketing flash.
 */
export default async function Home() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return <LandingPage />;
  }

  let user: User | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    user = sessionUser;
  } catch (err) {
    console.error('Root route session check failed:', err);
  }

  if (user) {
    return <HomeAuthenticated user={user} />;
  }

  return <LandingPage />;
}
