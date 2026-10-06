'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { CardVisual } from '@/components/ds/CardVisual';
import { SegmentedControl } from '@/components/ds/SegmentedControl';
import { Skeleton } from '@/components/ds/Skeleton';
import { useAuth } from '@/lib/AuthContext';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { eventDisplayTitle } from '@/lib/events/eventMetadata';
import { formatEventWhen } from '@/lib/home/format';
import type { MineEvent } from '@/lib/server/events/mineEvents';
import { eventHref } from '@/lib/shell/appNav';

/** Same key and response shape as every other `/api/beacons/mine` reader, so they share SWR's cache. */
export const MINE_EVENTS_KEY = '/api/beacons/mine';

async function fetchMine(url: string): Promise<{ events?: MineEvent[] }> {
  const res = await fetch(url, { headers: await getFreshAuthHeaders() });
  if (!res.ok) throw new Error('Could not load your events.');
  return res.json();
}

type Filter = 'hosting' | 'going';

function upcoming(e: MineEvent, nowMs: number): boolean {
  const end = Date.parse(e.event_end_at ?? '');
  const start = Date.parse(e.event_start_at ?? '');
  if (Number.isFinite(end)) return end > nowMs;
  return !Number.isFinite(start) || start + 3 * 3_600_000 > nowMs;
}

/**
 * "Your events" (spec §7.6.1): a horizontal strip of upcoming events you host or are going to,
 * shown only when there are any. Loads in the browser so the public list stays shared-cacheable.
 */
export function YourEventsStrip({ timeZone }: { timeZone: string }) {
  const { user } = useAuth();
  const { data, isLoading } = useSWR(user ? MINE_EVENTS_KEY : null, fetchMine, { revalidateOnFocus: false });
  const [nowMs] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter | null>(null);
  if (!user) return null;
  if (isLoading && !data) {
    return (
      <div className="mb-10 flex gap-3 overflow-hidden" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[196px] w-60 shrink-0" rounded="lg" />
        ))}
      </div>
    );
  }
  const soon = (data?.events ?? [])
    .filter((e) => upcoming(e, nowMs))
    .sort((a, b) => (Date.parse(a.event_start_at ?? '') || 0) - (Date.parse(b.event_start_at ?? '') || 0));
  if (soon.length === 0) return null;
  const hosting = soon.filter((e) => e.role === 'creator');
  const going = soon.filter((e) => e.role !== 'creator');
  const active: Filter = filter ?? (hosting.length ? 'hosting' : 'going');
  const shown = active === 'hosting' ? hosting : going;

  return (
    <section aria-labelledby="your-events" className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="your-events" className="type-title-3 text-fg">
          Your events
        </h2>
        <SegmentedControl<Filter>
          size="sm"
          label="Filter your events"
          value={active}
          onChange={setFilter}
          segments={[
            { value: 'hosting', label: `Hosting${hosting.length ? ` · ${hosting.length}` : ''}` },
            { value: 'going', label: `Going${going.length ? ` · ${going.length}` : ''}` },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <p className="type-meta rounded-lg bg-surface px-4 py-6 text-center text-fg-secondary">
          {active === 'hosting' ? 'You’re not hosting anything coming up.' : 'You haven’t RSVPed to anything coming up.'}
        </p>
      ) : (
        <ul className="-mx-[var(--gutter)] flex snap-x gap-3 overflow-x-auto px-[var(--gutter)] pb-1 [scrollbar-width:none]">
          {shown.map((e) => (
            <li key={e.beacon_id} className="w-60 shrink-0 snap-start">
              <Link href={eventHref(e.beacon_id)} className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <CardVisual seed={e.beacon_id} photoUrl={e.image_url} ratio="16:9" radius="lg" sizes="240px" />
                <p className="type-body-strong mt-2 line-clamp-1 text-fg group-hover:underline">
                  {eventDisplayTitle(e.title, e.location_name, e.description)}
                </p>
                <p className="type-meta tabular text-fg-secondary">{formatEventWhen(e.event_start_at, timeZone, nowMs)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
