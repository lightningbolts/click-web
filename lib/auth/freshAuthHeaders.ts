/**
 * Browser auth headers for click-web BFF calls.
 *
 * Proactively refreshes near-expiry / missing access tokens with a process-wide
 * single-flight so parallel ChatView / Dashboard / profile fetches do not stampede
 * Supabase `/auth/v1/token`.
 */

import { getSupabaseClient } from '@/lib/supabase';

const NEAR_EXPIRY_MS = 90_000;

let refreshInFlight: Promise<void> | null = null;

function accessTokenExpiresAtMs(session: {
  expires_at?: number | null;
  access_token?: string | null;
}): number | null {
  if (typeof session.expires_at === 'number' && Number.isFinite(session.expires_at)) {
    return session.expires_at * 1000;
  }
  const jwt = session.access_token?.trim();
  if (!jwt) return null;
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (payload.length % 4)) % 4;
    const json = JSON.parse(atob(payload + '='.repeat(pad))) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function ensureFreshBrowserSession(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    await runSharedRefresh(() => supabase.auth.refreshSession());
    return;
  }

  const exp = accessTokenExpiresAtMs(session);
  const now = Date.now();
  if (exp != null && exp > now + NEAR_EXPIRY_MS) return;

  await runSharedRefresh(() => supabase.auth.refreshSession());
}

function runSharedRefresh(start: () => Promise<unknown>): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve()
      .then(() => start())
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Headers with a fresh Bearer JWT when possible. */
export async function getFreshAuthHeaders(): Promise<HeadersInit> {
  await ensureFreshBrowserSession();
  const supabase = getSupabaseClient();
  if (!supabase) return { 'Content-Type': 'application/json' };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

/**
 * Fetch helper: on 401, force one refresh + retry with new headers.
 * Returns the final Response (caller parses JSON / throws).
 */
export async function fetchWithFreshAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const fresh = await getFreshAuthHeaders();
  const freshHeaders = new Headers(fresh);
  freshHeaders.forEach((value, key) => {
    if (!headers.has(key)) headers.set(key, value);
  });
  // Always prefer the freshly minted Authorization.
  const auth = freshHeaders.get('Authorization');
  if (auth) headers.set('Authorization', auth);

  let res = await fetch(input, { ...init, headers });
  if (res.status !== 401) return res;

  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.refreshSession().catch(() => undefined);
  }
  const retryHeaders = await getFreshAuthHeaders();
  const merged = new Headers(init?.headers);
  const retry = new Headers(retryHeaders);
  retry.forEach((value, key) => {
    if (!merged.has(key)) merged.set(key, value);
  });
  const retryAuth = retry.get('Authorization');
  if (retryAuth) merged.set('Authorization', retryAuth);

  res = await fetch(input, { ...init, headers: merged });
  return res;
}

/** User-facing message for auth failures on chat/profile loads. */
export function authFailureMessage(status: number, fallback: string): string {
  if (status === 401 || status === 403) {
    return 'Session expired. Sign in again.';
  }
  return fallback;
}

/** Test-only: clear single-flight state. */
export function resetFreshAuthHeadersForTests(): void {
  refreshInFlight = null;
}
