'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { LocateFixed, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { EmptyState } from '@/components/ds/EmptyState';
import { InlineNotice } from '@/components/ds/InlineNotice';
import { Sheet } from '@/components/ds/Sheet';
import { TextField } from '@/components/ds/TextField';
import { freshHubLocation, hubRequest } from '@/lib/hub/client';
import { hubThreadHref } from '@/lib/shell/appNav';
import { readRecentHubs, rememberHub, subscribeRecentHubs, type RecentHub } from '@/lib/hub/recentHubs';
import { cn } from '@/lib/cn';

type NearbyHub = { id: string; name: string; category: string; distance_meters?: number; participant_count?: number; event_beacon_id?: string | null };

const EMPTY: RecentHub[] = [];

function HubRow({ hub, meta, selected, onOpen }: { hub: RecentHub; meta: string; selected?: boolean; onOpen?: () => void }) {
  return (
    <li className="px-2">
      <Link
        href={hubThreadHref(hub.id)}
        onClick={onOpen}
        aria-current={selected ? 'page' : undefined}
        className={cn(
          'flex h-[72px] items-center gap-3 rounded-md px-3 transition-colors duration-[var(--d-fast)]',
          selected ? 'bg-selection' : 'hover:bg-hover',
        )}
      >
        <CardVisual seed={hub.id} className="size-12 shrink-0 rounded-full" radius={0} />
        <span className="min-w-0 flex-1">
          <span className="type-body-strong block truncate text-fg">{hub.name}</span>
          <span className="type-body block truncate text-fg-secondary">{meta}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * The Hubs filter (spec §7.2): hubs you've opened on this device, and nearby hubs on request.
 * Location is only asked for when you tap "Find nearby hubs" or start one.
 */
export function HubsList({ selectedHubId }: { selectedHubId: string | null }) {
  const router = useRouter();
  // Recent hubs live on this device: the server can't know them, so it claims neither a list nor
  // "No hubs yet" (`null`), and the first client render shows the real list.
  const stored = useSyncExternalStore(subscribeRecentHubs, readRecentHubs, () => null);
  const recent = stored ?? EMPTY;
  const [nearby, setNearby] = useState<NearbyHub[] | null>(null);
  const [busy, setBusy] = useState<'find' | 'create' | string | null>(null);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');

  const find = async () => {
    setBusy('find');
    setError('');
    try {
      const { user_lat, user_long } = await freshHubLocation();
      const result = await hubRequest<{ hubs: NearbyHub[] }>(`/api/hub/nearby?lat=${user_lat}&lon=${user_long}`);
      setNearby(result.hubs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async (hub: NearbyHub) => {
    setBusy(hub.id);
    setError('');
    try {
      const coords = hub.event_beacon_id ? {} : await freshHubLocation();
      await hubRequest('/api/hub/join', { hub_id: hub.id, ...coords });
      rememberHub({ id: hub.id, name: hub.name });
      router.push(hubThreadHref(hub.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy('create');
    setError('');
    try {
      const coords = await freshHubLocation();
      const result = await hubRequest<{ hub_id: string }>('/api/hub/create', {
        name: trimmed,
        category: 'general',
        location: { lat: coords.user_lat, lng: coords.user_long },
      });
      rememberHub({ id: result.hub_id, name: trimmed });
      setCreateOpen(false);
      setName('');
      router.push(hubThreadHref(result.hub_id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const recentIds = new Set(recent.map((h) => h.id));
  const nearbyOnly = nearby?.filter((h) => !recentIds.has(h.id)) ?? null;

  return (
    <div>
      {recent.length > 0 ? (
        <section aria-label="Your hubs">
          <ul>
            {recent.map((hub) => (
              <HubRow key={hub.id} hub={hub} meta="Hub chat" selected={hub.id === selectedHubId} />
            ))}
          </ul>
        </section>
      ) : null}

      {nearbyOnly && nearbyOnly.length > 0 ? (
        <section aria-labelledby="nearby-hubs" className="pt-2">
          <h2 id="nearby-hubs" className="type-meta px-5 pb-1 font-semibold text-fg-tertiary">
            Nearby
          </h2>
          <ul>
            {nearbyOnly.map((hub) => (
              <li key={hub.id} className="px-2">
                <div className="flex h-[72px] items-center gap-3 rounded-md px-3">
                  <CardVisual seed={hub.id} className="size-12 shrink-0 rounded-full" radius={0} />
                  <span className="min-w-0 flex-1">
                    <span className="type-body-strong block truncate text-fg">{hub.name}</span>
                    <span className="type-body block truncate text-fg-secondary">
                      {hub.participant_count ?? 0} here
                      {hub.distance_meters != null ? ` · ${Math.round(hub.distance_meters)} m` : ''}
                    </span>
                  </span>
                  <Button size="sm" variant="tinted" loading={busy === hub.id} disabled={busy !== null} onClick={() => void join(hub)}>
                    Join
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stored && recent.length === 0 && !nearbyOnly?.length ? (
        <EmptyState
          icon={MapPin}
          title={nearby ? 'No hubs nearby yet' : 'No hubs yet'}
          body={
            nearby
              ? 'Start one where you are. People within 50 metres can join the conversation.'
              : 'Hubs are open conversations rooted in a real place. Join one while you’re there.'
          }
        />
      ) : null}

      {error ? (
        <InlineNotice variant="destructive" live className="mx-4 mt-2">
          {error}
        </InlineNotice>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2 px-4 pt-4">
        <Button variant="secondary" size="sm" icon={LocateFixed} loading={busy === 'find'} disabled={busy !== null} onClick={() => void find()}>
          Find nearby hubs
        </Button>
        <Button variant="plain" size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
          Start a hub here
        </Button>
      </div>

      <Sheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Start a hub"
        description="A hub is an open conversation pinned to where you are now, within 50 metres."
        footer={
          <Button fullWidth loading={busy === 'create'} disabled={!name.trim() || busy !== null} onClick={() => void create()}>
            Create hub here
          </Button>
        }
      >
        <TextField label="Hub name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
      </Sheet>
    </div>
  );
}
