import { getSupabaseClient } from '@/lib/supabase';

/**
 * Fetch same-origin insights APIs with the Supabase access token so Route Handlers
 * can authenticate users who use the implicit-flow browser client (localStorage).
 */
export async function fetchInsightsApi(url: string): Promise<Response> {
  const headers = new Headers();
  headers.set('Accept', 'application/json');

  const supabase = getSupabaseClient();
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }
  }

  return fetch(url, { credentials: 'include', headers });
}

export async function fetchInsightsApiJson<T>(url: string): Promise<T> {
  const res = await fetchInsightsApi(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.') as Error & {
      status?: number;
      info?: unknown;
    };
    error.status = res.status;
    error.info = await res.json().catch(() => ({}));
    throw error;
  }
  return res.json() as Promise<T>;
}

export async function postInsightsApiJson<T>(url: string, body: unknown): Promise<T> {
  const headers = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
  });

  const supabase = getSupabaseClient();
  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }
  }

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = new Error('An error occurred while posting the data.') as Error & {
      status?: number;
      info?: unknown;
    };
    error.status = res.status;
    error.info = await res.json().catch(() => ({}));
    throw error;
  }
  return res.json() as Promise<T>;
}
