'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';

/** Pages that read the fragment's token themselves without signing in. */
const OWN_FRAGMENT = /^\/devices\//;

/** The session tokens in a Supabase email-link fragment (`#access_token=…&refresh_token=…`). */
export function sessionFromFragment(hash: string): { access_token: string; refresh_token: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

/**
 * Links Supabase sends from the server (Place invites, sign-in links) can't use PKCE, so they
 * land with the session in the URL fragment, which the browser client doesn't read
 * (`detectSessionInUrl: false`) and the server never sees. Turn it into the cookie session,
 * drop it from the address bar, and re-render: the page (or `/login?next=…`, which redirects
 * signed-in visitors) now sees the user.
 */
export function SessionFromUrlFragment() {
  const router = useRouter();
  useEffect(() => {
    if (OWN_FRAGMENT.test(window.location.pathname)) return;
    const tokens = sessionFromFragment(window.location.hash);
    if (!tokens) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.auth.setSession(tokens).then(({ error }) => {
      if (error) {
        console.error('Sign-in link session failed:', error.message);
        return;
      }
      router.refresh();
    });
  }, [router]);
  return null;
}
