'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import type { ActivityRecap, RecapWindow } from '@/lib/me/activityRecap';

export async function fetchHomeData<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: await getFreshAuthHeaders(), cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load. Please try again.');
  return response.json();
}

export default function HomeActivityRecap({ userId }: { userId: string }) {
  const [window, setWindow] = useState<RecapWindow>('week');
  const { data, error, isLoading, mutate } = useSWR(
    ['home-recap', userId, window],
    () => fetchHomeData<{ recap: ActivityRecap }>(`/api/me/recap?window=${window}`),
    { keepPreviousData: true, refreshInterval: 60_000 },
  );
  const recap = data?.recap;
  const values: [string, number][] = recap ? [
    ['Connections made', recap.connections_formed],
    ['Messages sent', recap.messages_sent],
    ['Messages received', recap.messages_received],
    ['Beacons created', recap.beacons_created],
    ['Event RSVPs', recap.events_rsvped],
    ['Event check-ins', recap.events_checked_in],
    ['Events saved', recap.events_saved],
  ] : [];
  return (
    <section className="fc-card rounded-2xl p-5" aria-label="Activity recap" aria-busy={isLoading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Your activity</h2>
        <div className="flex gap-2" aria-label="Activity period">
          {(['day', 'week'] as const).map((period) => (
            <button key={period} type="button" aria-pressed={window === period} onClick={() => setWindow(period)}
              className={`rounded-xl border-2 border-border-hard px-4 py-2 text-sm font-semibold ${window === period ? 'bg-primary text-white' : 'bg-surface text-on-surface'}`}>
              {period === 'day' ? 'Day' : 'Week'}
            </button>
          ))}
        </div>
      </div>
      {error ? <p role="alert" className="mt-4 text-sm">Couldn’t refresh your activity. <button type="button" className="underline" onClick={() => void mutate()}>Retry</button></p> : null}
      {!recap ? <p role="status" className="mt-4 text-sm text-on-surface-variant">{error ? 'Activity is unavailable.' : 'Loading your activity…'}</p> : (
        <>
          <p className="mt-2 text-sm text-on-surface-variant">{recap.window === 'day' ? 'Past 24 hours' : 'Past 7 days'}{isLoading ? ' · Updating…' : ''}</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {values.map(([label, count]) => <div key={label}><dt className="text-sm text-on-surface-variant">{label}</dt><dd className="text-2xl font-bold">{count}</dd></div>)}
          </dl>
          {values.every(([, count]) => count === 0) ? <p className="mt-4 text-sm">Your next connection starts in person. <Link href="/?tab=identity" className="font-semibold text-primary underline">Share your QR identity</Link></p> : null}
        </>
      )}
    </section>
  );
}
