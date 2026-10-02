import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
export async function ticketingApi<T>(
  url: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  signal?: AbortSignal,
): Promise<T> {
  const headers = await getFreshAuthHeaders();
  const response = await fetch(url, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || data.ok === false)
    throw new Error(data.code ?? data.error ?? 'Ticketing request failed');
  return data as T;
}
