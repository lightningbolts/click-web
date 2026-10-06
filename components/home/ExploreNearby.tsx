'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ds/Button';
import { SectionHeader } from '@/components/ds/SectionHeader';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

const RADIUS_M = 5_000;

type Layer = { id: 'events' | 'places' | 'hangouts' | 'beacons'; label: string; icon: LucideIcon };
const LAYERS: Layer[] = [
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'places', label: 'Places', icon: MapPin },
  { id: 'hangouts', label: 'Hangouts', icon: Users },
  { id: 'beacons', label: 'Beacons', icon: Sparkles },
];

/** `places` is null when Places isn't enabled for this account. */
type Counts = Record<Exclude<Layer['id'], 'places'>, number> & { places: number | null };
type State =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'denied' }
  | { kind: 'ready'; counts: Counts }
  | { kind: 'error' };

async function loadCounts(lat: number, lon: number): Promise<Counts> {
  const headers = await getFreshAuthHeaders();
  const q = `lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&radius_meters=${RADIUS_M}`;
  const [beaconsRes, hubsRes, placesRes] = await Promise.all([
    fetch(`/api/beacons?${q}&limit=100`, { headers }),
    fetch(`/api/hub/nearby?${q}&limit=100`, { headers }),
    fetch(`/api/places/nearby?${q}&limit=100`, { headers }).catch(() => null),
  ]);
  if (!beaconsRes.ok || !hubsRes.ok) throw new Error('nearby');
  const { beacons = [] } = (await beaconsRes.json()) as { beacons?: { beacon_type: string }[] };
  const { hubs = [] } = (await hubsRes.json()) as { hubs?: unknown[] };
  const places = placesRes?.ok ? (((await placesRes.json()) as { places?: unknown[] }).places?.length ?? 0) : null;
  const events = beacons.filter((b) => b.beacon_type === 'event').length;
  return { events, places, hangouts: hubs.length, beacons: beacons.length - events };
}

/** Permission state without prompting; null where the Permissions API is missing. */
async function geoPermission(): Promise<PermissionState | null> {
  try {
    return (await navigator.permissions?.query({ name: 'geolocation' }))?.state ?? null;
  } catch {
    return null;
  }
}

/**
 * ⑥ Explore nearby: live counts within ~5 km. Never prompts for location on load — only after an
 * explicit tap, or silently when permission was already granted.
 */
export function ExploreNearby() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const locate = () => {
    if (!('geolocation' in navigator)) return setState({ kind: 'error' });
    setState({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        loadCounts(pos.coords.latitude, pos.coords.longitude)
          .then((counts) => setState({ kind: 'ready', counts }))
          .catch(() => setState({ kind: 'error' }));
      },
      (err) => setState({ kind: err.code === err.PERMISSION_DENIED ? 'denied' : 'error' }),
      { maximumAge: 5 * 60_000, timeout: 10_000 },
    );
  };

  useEffect(() => {
    let cancelled = false;
    void geoPermission().then((permission) => {
      if (!cancelled && permission === 'granted') locate();
      if (!cancelled && permission === 'denied') setState({ kind: 'denied' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = state.kind === 'ready' ? state.counts : null;

  return (
    <section aria-labelledby="home-nearby">
      <SectionHeader id="home-nearby" title="Explore nearby" href="/map" linkLabel="Open map" />
      <ul className="flex flex-wrap gap-2" aria-busy={state.kind === 'locating'}>
        {LAYERS.filter((l) => l.id !== 'places' || counts?.places != null).map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <Link
              href={`/map?layer=${id}`}
              className={cn(
                'press type-body-strong inline-flex h-9 items-center gap-1.5 rounded-pill bg-fill-subtle px-3.5 text-fg hover:bg-hover',
                state.kind === 'locating' && 'animate-pulse',
              )}
            >
              <Icon size={16} strokeWidth={2} aria-hidden className="text-fg-secondary" />
              {label}
              {counts ? <span className="tabular text-fg-tertiary">{counts[id]}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      {state.kind === 'idle' || state.kind === 'error' ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="type-meta text-fg-tertiary">
            {state.kind === 'error' ? 'Couldn’t load what’s nearby.' : 'See what’s live around you right now.'}
          </p>
          <Button variant="plain" size="sm" icon={MapPin} onClick={locate}>
            {state.kind === 'error' ? 'Try again' : 'Use my location'}
          </Button>
        </div>
      ) : (
        <p className="type-meta mt-3 text-fg-tertiary">
          {state.kind === 'denied'
            ? 'Location is off for Click in this browser. The map still works without it.'
            : 'Counts reflect what’s live within about 5 km right now.'}
        </p>
      )}
    </section>
  );
}
