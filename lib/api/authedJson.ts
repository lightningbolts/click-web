import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

/** The server's human message from an error body, if it sent one. */
function errorMessage(data: unknown): string | null {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === 'string') return error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : null;
}

/**
 * Authenticated JSON request from the browser. Resolves with the parsed body; throws an Error
 * carrying the server's message (or `fallback`) when the response isn't ok.
 */
export async function authedJson<T = Record<string, unknown>>(
  path: string,
  { method = 'GET', body, fallback = 'Something went wrong. Try again.' }: { method?: string; body?: unknown; fallback?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(await getFreshAuthHeaders()) } as Record<string, string>;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorMessage(data) ?? fallback);
  return data as T;
}
