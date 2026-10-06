import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

/** Authenticated request for Home's inline actions; throws the server's message (or a generic one). */
export async function homeRequest<T = Record<string, unknown>>(
  method: 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: HeadersInit = { ...(await getFreshAuthHeaders()) };
  if (body !== undefined) (headers as Record<string, string>)['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : 'Couldn’t complete this. Try again.');
  }
  return data as T;
}

export function postHomeAction<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  return homeRequest<T>('POST', path, body);
}
