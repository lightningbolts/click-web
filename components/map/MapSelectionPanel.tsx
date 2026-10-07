'use client';

import { EventMarkdownPreview } from '@/components/events/EventMarkdownContent';
import { ArrowLeft, ArrowUpRight, CalendarDays, ExternalLink, MapPin, MessageCircle, Music, UserRound } from 'lucide-react';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { CardVisual } from '@/components/ds/CardVisual';
import { IconButton } from '@/components/ds/IconButton';
import { StatusPill } from '@/components/ds/StatusPill';
import { beaconHeroImageUrl } from '@/lib/ui/beaconHeroImageUrl';
import { displayTitleForBeacon, humanizeBeaconType, isSafeBeaconUri, type MapBeaconRecord } from '@/lib/map/mapBeacons';
import { isSafeBeaconPreviewUrl } from '@/lib/map/beaconPopupHtml';
import { parseEventScheduleFromMetadata } from '@/lib/map/eventSchedule';
import { formatEventWhen } from '@/lib/events/formatEventWhen';
import { eventSharePath } from '@/lib/events/eventUrls';
import { categoryLabel } from '@/lib/places/categories';
import { hereNowLine, pulseLine } from '@/lib/places/labels';
import type { PlaceSummary } from '@/lib/places/types';

export type MapSelection =
  | { kind: 'connections'; ids: string[]; lng: number; lat: number }
  | { kind: 'beacon'; id: string; lng: number; lat: number }
  | { kind: 'place'; id: string; lng: number; lat: number };

function metDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function metaString(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function ConnectionDetail({
  connections,
  onMessage,
  onProfile,
}: {
  connections: ConnectionRecord[];
  onMessage?: (c: ConnectionRecord) => void;
  onProfile?: (c: ConnectionRecord) => void;
}) {
  if (connections.length === 1) {
    const c = connections[0];
    const ambience = [c.weatherSummary, c.noiseSummary].filter(Boolean).join(' · ');
    return (
      <div className="px-4 pb-4">
        <div className="flex items-center gap-3">
          <Avatar seed={c.otherUserId ?? c.id} name={c.name} src={c.avatarUrl} size={56} />
          <div className="min-w-0">
            <p className="type-title-3 truncate text-fg">{c.name}</p>
            <p className="type-meta text-fg-tertiary">Clicked {metDate(c.dateMet)}</p>
          </div>
        </div>
        <p className="type-body mt-4 flex items-start gap-2 text-fg">
          <MapPin size={16} aria-hidden className="mt-0.5 shrink-0 text-fg-secondary" />
          {c.location || 'Location not recorded'}
        </p>
        {c.context ? <StatusPill variant="tinted" className="mt-3">{c.context}</StatusPill> : null}
        {ambience ? <p className="type-meta mt-2 text-fg-secondary">{ambience}</p> : null}
        <div className="mt-5 flex gap-2">
          {onMessage ? (
            <Button variant="primary" icon={MessageCircle} className="flex-1" onClick={() => onMessage(c)}>
              Message
            </Button>
          ) : null}
          {onProfile && c.otherUserId ? (
            <Button variant="secondary" icon={UserRound} className="flex-1" onClick={() => onProfile(c)}>
              Profile
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 pb-4">
      <p className="type-title-3 text-fg">{connections.length} people you met here</p>
      <p className="type-meta mt-0.5 flex items-center gap-1.5 text-fg-secondary">
        <MapPin size={14} aria-hidden className="shrink-0" />
        <span className="truncate">{connections[0].location}</span>
      </p>
      <ul className="mt-3">
        {connections.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
            <Avatar seed={c.otherUserId ?? c.id} name={c.name} src={c.avatarUrl} size={40} />
            <div className="min-w-0 flex-1">
              <p className="type-body-strong truncate text-fg">{c.name}</p>
              <p className="type-meta text-fg-tertiary">{metDate(c.dateMet)}</p>
            </div>
            {onMessage ? <IconButton icon={MessageCircle} size="sm" variant="filled" aria-label={`Message ${c.name}`} onClick={() => onMessage(c)} /> : null}
            {onProfile && c.otherUserId ? (
              <IconButton icon={UserRound} size="sm" variant="filled" aria-label={`${c.name}’s profile`} onClick={() => onProfile(c)} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BeaconDetail({ beacon }: { beacon: MapBeaconRecord }) {
  const m = beacon.metadata;
  const title = displayTitleForBeacon(beacon);
  const isEvent = beacon.beacon_type === 'event';
  const schedule = parseEventScheduleFromMetadata(m);
  const when = schedule ? formatEventWhen(new Date(schedule.startEpochMs).toISOString(), new Date(schedule.endEpochMs).toISOString(), null) : null;
  const place = metaString(m, 'location_name', 'place_name', 'venue_name');
  const description = metaString(m, 'description', 'text', 'message', 'body');
  const preview = metaString(m, 'preview_url');
  const listen = [metaString(m, 'spotify_playlist_uri'), metaString(m, 'spotify_url'), metaString(m, 'music_url'), metaString(m, 'apple_music_url')].find(
    (u): u is string => Boolean(u && isSafeBeaconUri(u)),
  );
  const host = beacon.show_creator_name ? beacon.creator_name?.trim() : null;

  return (
    <div className="px-4 pb-4">
      <CardVisual seed={beacon.id} photoUrl={beaconHeroImageUrl(m)} ratio="16:9" radius="lg" sizes="380px" />
      <StatusPill variant="neutral" className="mt-3">
        {humanizeBeaconType(beacon.beacon_type)}
      </StatusPill>
      <p className="type-title-3 mt-2 text-fg">{title}</p>
      {host ? <p className="type-meta mt-0.5 text-fg-secondary">By {host}</p> : null}
      {when ? (
        <p className="type-body mt-3 flex items-start gap-2 text-fg">
          <CalendarDays size={16} aria-hidden className="mt-0.5 shrink-0 text-fg-secondary" />
          {when}
        </p>
      ) : null}
      {place ? (
        <p className="type-body mt-1.5 flex items-start gap-2 text-fg-secondary">
          <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
          {place}
        </p>
      ) : null}
      {description && description !== title ? (
        <EventMarkdownPreview title={title} className="type-body mt-3 line-clamp-4 text-fg-secondary">
          {description}
        </EventMarkdownPreview>
      ) : null}
      {preview && isSafeBeaconPreviewUrl(preview) ? (
        <div className="mt-3">
          <p className="type-meta mb-1 flex items-center gap-1 font-semibold text-fg-secondary">
            <Music size={14} aria-hidden />
            30-second preview
          </p>
          <audio controls preload="none" controlsList="nodownload noplaybackrate" className="h-9 w-full" src={preview} />
        </div>
      ) : null}
      <div className="mt-5 flex flex-col gap-2">
        {isEvent ? (
          <Button href={eventSharePath(beacon.id)} variant="primary" trailingIcon={ArrowUpRight}>
            View event
          </Button>
        ) : null}
        {listen ? (
          <Button href={listen} target="_blank" rel="noopener noreferrer" variant="secondary" trailingIcon={ExternalLink}>
            Open in music app
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** A Click Place on the map (spec §9.8): what it's like now, and its Place page. */
function PlaceDetail({ place, nowMs }: { place: PlaceSummary; nowMs: number }) {
  const hereNow = hereNowLine(place.here_now_count);
  return (
    <div className="px-4 pb-4">
      <CardVisual seed={place.id} photoUrl={place.photo_url} ratio="16:9" radius="lg" sizes="380px" />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {place.open_now != null ? <StatusPill variant={place.open_now ? 'tinted' : 'neutral'}>{place.open_now ? 'Open' : 'Closed'}</StatusPill> : null}
        {place.pulse.state === 'live' ? <StatusPill variant="live">Live</StatusPill> : null}
      </div>
      <p className="type-title-3 mt-2 text-fg">{place.name}</p>
      <p className="type-meta text-fg-secondary">{[categoryLabel(place.category), place.city].filter(Boolean).join(' · ')}</p>
      <p className="type-body mt-3 text-fg">{pulseLine(place.pulse, nowMs)}</p>
      {hereNow ? <p className="type-meta mt-1 text-fg-secondary">{hereNow}</p> : null}
      <Button href={`/p/${place.slug}`} variant="primary" trailingIcon={ArrowUpRight} className="mt-5 w-full">
        View Place page
      </Button>
    </div>
  );
}

/**
 * What a selected pin is and what to do next, in the Nearby panel (spec §7.5): a back arrow
 * returns to the list, the way the panel keeps context in one place.
 */
export function MapSelectionPanel({
  selection,
  connections,
  beacon,
  place,
  onClose,
  onMessage,
  onProfile,
}: {
  selection: MapSelection;
  connections: ConnectionRecord[];
  beacon: MapBeaconRecord | null;
  place?: PlaceSummary | null;
  onClose: () => void;
  onMessage?: (c: ConnectionRecord) => void;
  onProfile?: (c: ConnectionRecord) => void;
}) {
  // eslint-disable-next-line react-hooks/purity -- relative Pulse ages only
  const nowMs = Date.now();
  return (
    <div data-testid="map-selection-panel">
      <div className="flex items-center gap-2 px-2 py-2">
        <IconButton icon={ArrowLeft} aria-label="Back to Nearby" onClick={onClose} />
      </div>
      {selection.kind === 'beacon' ? (
        beacon ? (
          <BeaconDetail beacon={beacon} />
        ) : (
          <p className="type-body px-4 pb-4 text-fg-secondary">This pin is no longer in view. Pan or zoom to refresh.</p>
        )
      ) : selection.kind === 'place' ? (
        place ? (
          <PlaceDetail place={place} nowMs={nowMs} />
        ) : (
          <p className="type-body px-4 pb-4 text-fg-secondary">This Place is no longer in view.</p>
        )
      ) : connections.length > 0 ? (
        <ConnectionDetail connections={connections} onMessage={onMessage} onProfile={onProfile} />
      ) : (
        <p className="type-body px-4 pb-4 text-fg-secondary">This connection is no longer on your map.</p>
      )}
    </div>
  );
}
