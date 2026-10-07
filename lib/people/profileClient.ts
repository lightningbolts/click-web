import { authFailureMessage, getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { warmFetch, withWarmFetch } from '@/lib/swr/warmFetch';
import type { UserProfilePayload } from '@/lib/userProfile/profileModalTypes';

/** GET as the viewer; a failed read throws with the server's message and the HTTP status. */
export async function profileJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: await getFreshAuthHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof json?.error === 'string' && json.error.trim() ? json.error : 'Couldn’t load this profile.';
    const err = new Error(authFailureMessage(res.status, message)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

export function profilePath(userId: string) {
  return `/api/users/${encodeURIComponent(userId)}/profile`;
}

/** A person's profile (`profilePath`), answered by a read warmed on intent. */
export const fetchProfile = withWarmFetch((path) => profileJson<UserProfilePayload>(path));

/** Starts reading a profile before it opens (a link to it hovered, touched or focused). */
export function warmPersonProfile(userId: string): void {
  warmFetch(profilePath(userId), profileJson<UserProfilePayload>);
}
