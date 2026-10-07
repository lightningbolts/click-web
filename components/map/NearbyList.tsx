'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ds/Avatar';
import { CardVisual } from '@/components/ds/CardVisual';
import { Chip } from '@/components/ds/Chip';
import { SearchField } from '@/components/ds/SearchField';
import { StatusPill } from '@/components/ds/StatusPill';
import type { PositionedConnection } from '@/lib/map/connectionMapGeo';
import {
  beaconLayerGroup,
  beaconTint,
  beaconUnclusteredIconChar,
  displayTitleForBeacon,
  humanizeBeaconType,
  type MapBeaconRecord,
} from '@/lib/map/mapBeacons';
import { categoryLabel } from '@/lib/places/categories';
import type { PlaceSummary } from '@/lib/places/types';
import { beaconHeroImageUrl } from '@/lib/ui/beaconHeroImageUrl';
import type { MapSelection } from './MapSelectionPanel';

type NearbyFilter = 'all' | 'events' | 'places' | 'people' | 'other';

export type InView = { spots: PositionedConnection[]; events: MapBeaconRecord[]; other: MapBeaconRecord[]; places: PlaceSummary[] };

export function nearbyTotal(inView: InView): number {
  const people = inView.spots.reduce((n, s) => n + s.groupedConnections.length, 0);
  return inView.events.length + inView.places.length + people + inView.other.length;
}

/** One row in the Nearby list (spec §7.5): 48 visual, title with LIVE, one meta line. */
function NearbyRow({
  visual,
  title,
  subtitle,
  live,
  onSelect,
}: {
  visual: React.ReactNode;
  title: string;
  subtitle: string;
  live?: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover">
        {visual}
        <span className="min-w-0 flex-1">
          <span className="type-body-strong flex items-center gap-1.5 text-fg">
            <span className="truncate">{title}</span>
            {live ? <StatusPill variant="live">Live</StatusPill> : null}
          </span>
          <span className="type-meta block truncate text-fg-tertiary">{subtitle}</span>
        </span>
      </button>
    </li>
  );
}

function NearbySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pb-2">
      <h3 className="type-meta px-2 pb-1 pt-2 font-semibold text-fg-secondary">{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

/**
 * A beacon's row visual: its picture (a soundtrack's artwork, a photo) when it has one, else
 * the same tinted tile and glyph as its map pin.
 */
function BeaconRowVisual({ beacon }: { beacon: MapBeaconRecord }) {
  const photoUrl = beaconHeroImageUrl(beacon.metadata);
  if (photoUrl) {
    return <CardVisual seed={beacon.id} photoUrl={photoUrl} radius="sm" className="size-12 shrink-0" sizes="48px" />;
  }
  const group = beaconLayerGroup(beacon);
  return (
    <span
      className="flex size-12 shrink-0 items-center justify-center rounded-sm text-[18px] leading-none text-white"
      style={{ background: beaconTint(beacon.beacon_type, group) }}
      aria-hidden
    >
      {beaconUnclusteredIconChar(beacon.beacon_type, group)}
    </span>
  );
}

/** The Nearby list (spec §7.5): search, filter chips with counts, and sections of what's in view. */
export function NearbyList({
  inView,
  hasGeoConnections,
  onFocus,
}: {
  inView: InView;
  hasGeoConnections: boolean;
  onFocus: (selection: MapSelection) => void;
}) {
  const [filter, setFilter] = useState<NearbyFilter>('all');
  const [query, setQuery] = useState('');
  const focusOn = onFocus;
  const needle = query.trim().toLowerCase();
  const matches = (text: string | null | undefined) => !needle || (text ?? '').toLowerCase().includes(needle);
  const rows = {
    events: filter === 'all' || filter === 'events' ? inView.events.filter((b) => matches(displayTitleForBeacon(b))) : [],
    places: filter === 'all' || filter === 'places' ? inView.places.filter((p) => matches(p.name)) : [],
    people: filter === 'all' || filter === 'people' ? inView.spots.filter((s) => s.groupedConnections.some((c) => matches(c.name))) : [],
    other: filter === 'all' || filter === 'other' ? inView.other.filter((b) => matches(displayTitleForBeacon(b))) : [],
  };
  const peopleInView = inView.spots.reduce((n, s) => n + s.groupedConnections.length, 0);
  const total = inView.events.length + inView.places.length + peopleInView + inView.other.length;
  const liveNow = inView.places.filter((p) => p.pulse.state === 'live').length;
  const chips: { value: NearbyFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: total },
    { value: 'events', label: 'Events', count: inView.events.length },
    { value: 'places', label: 'Places', count: inView.places.length },
    { value: 'people', label: 'People', count: peopleInView },
    { value: 'other', label: 'Other', count: inView.other.length },
  ];
  const nothing = rows.events.length + rows.places.length + rows.people.length + rows.other.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-2 pt-4">
        <h2 className="type-title-3 text-fg">Nearby</h2>
        <p className="type-meta tabular text-fg-tertiary">
          {total} nearby{liveNow ? ` · ${liveNow} live now` : ''}
        </p>
        <SearchField
          value={query}
          onValueChange={setQuery}
          label="Search the map"
          placeholder="Search places, events, people"
          className="mt-3"
        />
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Show">
          {chips.map((c) => (
            <Chip key={c.value} size="sm" selected={filter === c.value} onClick={() => setFilter(c.value)}>
              {c.label}
              <span className="tabular opacity-70">{c.count}</span>
            </Chip>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!hasGeoConnections && filter !== 'events' && filter !== 'places' ? (
          <p className="type-meta mx-2 my-2 rounded-md bg-surface-raised px-3 py-2.5 text-fg-secondary">
            People you Click with appear where you met, once you allow location in the app.
          </p>
        ) : null}
        {nothing ? <p className="type-body px-2 py-6 text-center text-fg-secondary">Nothing here. Zoom out or move the map.</p> : null}
        {rows.events.length ? (
          <NearbySection title="Events">
            {rows.events.map((b) => (
              <NearbyRow
                key={b.id}
                visual={
                  <CardVisual seed={b.id} photoUrl={beaconHeroImageUrl(b.metadata)} radius="sm" className="size-12 shrink-0" sizes="48px" />
                }
                title={displayTitleForBeacon(b)}
                subtitle={humanizeBeaconType(b.beacon_type)}
                onSelect={() => focusOn({ kind: 'beacon', id: b.id, lng: b.lng, lat: b.lat })}
              />
            ))}
          </NearbySection>
        ) : null}
        {rows.places.length ? (
          <NearbySection title="Places">
            {rows.places.map((p) => (
              <NearbyRow
                key={p.id}
                visual={<CardVisual seed={p.id} photoUrl={p.photo_url} radius="sm" className="size-12 shrink-0" sizes="48px" />}
                title={p.name}
                subtitle={[categoryLabel(p.category), p.city].filter(Boolean).join(' · ')}
                live={p.pulse.state === 'live'}
                onSelect={() =>
                  focusOn({
                    kind: 'place',
                    id: p.id,
                    lng: p.longitude,
                    lat: p.latitude,
                  })
                }
              />
            ))}
          </NearbySection>
        ) : null}
        {rows.people.length ? (
          <NearbySection title="People">
            {rows.people.map((spot) => (
              <NearbyRow
                key={spot.connection.id}
                visual={
                  <Avatar
                    seed={spot.connection.otherUserId ?? spot.connection.id}
                    name={spot.connection.name}
                    src={spot.connection.avatarUrl}
                    size={48}
                  />
                }
                title={`${spot.connection.name}${spot.groupedConnections.length > 1 ? ` +${spot.groupedConnections.length - 1}` : ''}`}
                subtitle={spot.connection.location}
                onSelect={() =>
                  focusOn({
                    kind: 'connections',
                    ids: spot.groupedConnections.map((c) => c.id),
                    lng: spot.markerLongitude,
                    lat: spot.markerLatitude,
                  })
                }
              />
            ))}
          </NearbySection>
        ) : null}
        {rows.other.length ? (
          <NearbySection title="Other">
            {rows.other.map((b) => (
              <NearbyRow
                key={b.id}
                visual={<BeaconRowVisual beacon={b} />}
                title={displayTitleForBeacon(b)}
                subtitle={humanizeBeaconType(b.beacon_type)}
                onSelect={() => focusOn({ kind: 'beacon', id: b.id, lng: b.lng, lat: b.lat })}
              />
            ))}
          </NearbySection>
        ) : null}
      </div>
    </div>
  );
}
