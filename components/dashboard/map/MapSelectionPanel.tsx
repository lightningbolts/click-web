'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, ExternalLink, MapPin, MessageCircle, Music, UserRound, X } from 'lucide-react';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { ConnectionPeerAvatar } from '@/components/dashboard/ConnectionPeerAvatar';
import { CardVisualHero } from '@/components/ui/CardVisualSurface';
import { beaconHeroImageUrl } from '@/lib/ui/beaconHeroImageUrl';
import {
  displayTitleForBeacon,
  humanizeBeaconType,
  isSafeBeaconUri,
  type MapBeaconRecord,
} from '@/lib/map/mapBeacons';
import { isSafeBeaconPreviewUrl } from '@/lib/map/beaconPopupHtml';
import { parseEventScheduleFromMetadata } from '@/lib/map/eventSchedule';
import { formatEventWhen } from '@/lib/events/formatEventWhen';
import { eventSharePath } from '@/lib/events/eventUrls';
import { cn } from '@/lib/cn';

export type MapSelection =
  | { kind: 'connections'; ids: string[]; lng: number; lat: number }
  | { kind: 'beacon'; id: string; lng: number; lat: number };

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

function ConnectionActions({
  connection,
  onMessage,
  onProfile,
  compact = false,
}: {
  connection: ConnectionRecord;
  onMessage?: (c: ConnectionRecord) => void;
  onProfile?: (c: ConnectionRecord) => void;
  compact?: boolean;
}) {
  if (compact) {
    // Rows in a shared-spot list: icon buttons, so names keep the width.
    const iconButton =
      'inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-hard text-on-surface hover:bg-surface-container-low';
    return (
      <div className="flex shrink-0 gap-1.5">
        {onMessage ? (
          <button type="button" onClick={() => onMessage(connection)} className={iconButton} aria-label={`Message ${connection.name}`} title="Message">
            <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
          </button>
        ) : null}
        {onProfile && connection.otherUserId ? (
          <button type="button" onClick={() => onProfile(connection)} className={iconButton} aria-label={`${connection.name}'s profile`} title="Profile">
            <UserRound className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-4 flex gap-2">
      {onMessage ? (
        <button
          type="button"
          onClick={() => onMessage(connection)}
          className="fc-btn-primary inline-flex h-10 flex-1 items-center justify-center gap-1.5 px-3 text-sm"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Message
        </button>
      ) : null}
      {onProfile && connection.otherUserId ? (
        <button
          type="button"
          onClick={() => onProfile(connection)}
          className="fc-btn-secondary inline-flex h-10 flex-1 items-center justify-center gap-1.5 px-3 text-sm"
        >
          <UserRound className="h-4 w-4" aria-hidden />
          Profile
        </button>
      ) : null}
    </div>
  );
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
      <div className="p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Where you met</p>
        <div className="mt-3 flex items-center gap-3">
          <ConnectionPeerAvatar label={c.name} imageUrl={c.avatarUrl} size="xl" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-on-surface">{c.name}</p>
            <p className="text-sm text-on-surface-variant">{metDate(c.dateMet)}</p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-on-surface">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {c.location || 'Location not recorded'}
        </p>
        {c.context ? <span className="fc-chip mt-3 inline-flex">{c.context}</span> : null}
        {ambience ? <p className="mt-2 text-sm text-on-surface-variant">{ambience}</p> : null}
        <ConnectionActions connection={c} onMessage={onMessage} onProfile={onProfile} />
      </div>
    );
  }
  return (
    <div className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Same spot</p>
      <p className="mt-1 text-lg font-bold text-on-surface">{connections.length} people you met here</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-on-surface-variant">
        <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{connections[0].location}</span>
      </p>
      <ul className="mt-3 divide-y divide-border-hard">
        {connections.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            <ConnectionPeerAvatar label={c.name} imageUrl={c.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-on-surface">{c.name}</p>
              <p className="text-xs text-on-surface-variant">{metDate(c.dateMet)}</p>
            </div>
            <ConnectionActions connection={c} onMessage={onMessage} onProfile={onProfile} compact />
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
  const listen = [metaString(m, 'spotify_playlist_uri'), metaString(m, 'spotify_url'), metaString(m, 'music_url'), metaString(m, 'apple_music_url')]
    .find((u): u is string => Boolean(u && isSafeBeaconUri(u)));
  const host = beacon.show_creator_name ? beacon.creator_name?.trim() : null;

  return (
    <div>
      <CardVisualHero
        id={beacon.id}
        imageUrl={beaconHeroImageUrl(m)}
        chipLabel={humanizeBeaconType(beacon.beacon_type)}
        className="h-32"
      />
      <div className="p-4">
        <p className={cn('text-lg font-bold leading-snug text-on-surface', isEvent && 'font-display font-semibold')}>{title}</p>
        {host ? <p className="mt-0.5 text-sm text-on-surface-variant">by {host}</p> : null}
        {when ? (
          <p className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-on-surface">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {when}
          </p>
        ) : null}
        {place ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-on-surface-variant">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {place}
          </p>
        ) : null}
        {description && description !== title ? (
          <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-on-surface-variant">{description}</p>
        ) : null}
        {preview && isSafeBeaconPreviewUrl(preview) ? (
          <div className="mt-3">
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-on-surface-variant">
              <Music className="h-3.5 w-3.5" aria-hidden />
              30-second preview
            </p>
            <audio controls preload="none" controlsList="nodownload noplaybackrate" className="h-9 w-full" src={preview} />
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          {isEvent ? (
            <Link href={eventSharePath(beacon.id)} className="fc-btn-primary inline-flex h-10 items-center justify-center gap-1.5 px-3 text-sm">
              View event
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
          {listen ? (
            <a
              href={listen}
              target="_blank"
              rel="noopener noreferrer"
              className="fc-btn-secondary inline-flex h-10 items-center justify-center gap-1.5 px-3 text-sm"
            >
              Open in music app
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * What a selected pin is and what to do next. Rendered in React (not a MapLibre HTML popup),
 * so it follows the theme, is keyboard reachable, and can hold real actions.
 */
export function MapSelectionPanel({
  selection,
  connections,
  beacon,
  onClose,
  onMessage,
  onProfile,
}: {
  selection: MapSelection;
  connections: ConnectionRecord[];
  beacon: MapBeaconRecord | null;
  onClose: () => void;
  onMessage?: (c: ConnectionRecord) => void;
  onProfile?: (c: ConnectionRecord) => void;
}) {
  return (
    <div className="relative" data-testid="map-selection-panel">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-border-hard bg-surface text-on-surface-variant hover:text-on-surface"
        aria-label="Close"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      {selection.kind === 'beacon' ? (
        beacon ? (
          <BeaconDetail beacon={beacon} />
        ) : (
          <p className="p-4 pr-12 text-sm text-on-surface-variant">This pin is no longer in view. Pan or zoom to refresh.</p>
        )
      ) : connections.length > 0 ? (
        <ConnectionDetail connections={connections} onMessage={onMessage} onProfile={onProfile} />
      ) : (
        <p className="p-4 pr-12 text-sm text-on-surface-variant">This connection is no longer on your map.</p>
      )}
    </div>
  );
}
