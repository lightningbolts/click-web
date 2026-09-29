'use client';

import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

export async function hubRequest<T>(path: string, body?: unknown, method?: 'POST' | 'PATCH' | 'DELETE'): Promise<T> {
  const headers = new Headers(await getFreshAuthHeaders());
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'), headers, cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || (typeof data.error === 'string' ? data.error : data.error?.message) || 'Unable to access this hub.');
  return data as T;
}

export function freshHubLocation(): Promise<{ user_lat: number; user_long: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser does not support location.'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ user_lat: coords.latitude, user_long: coords.longitude }),
      () => reject(new Error('Location is unavailable. Allow location access and try again.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}
