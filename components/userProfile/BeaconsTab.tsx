'use client';

import { MapPin, X } from 'lucide-react';
import { CardVisualHero } from '@/components/ui/CardVisualSurface';
import type { BeaconPreviewItem, EventRecommendationPayload } from '@/lib/userProfile/profileModalTypes';
import { EmptyTabState } from '@/components/userProfile/ProfileModalPrimitives';

export type BeaconDetailState = {
  /** Raw beacon id, so the panel header paints the same generated visual as the list row. */
  beaconId: string;
  loading: boolean;
  error: string | null;
  title: string;
  description?: string;
  location?: string;
  schedule?: string;
  expired?: boolean;
  imageUrl?: string | null;
};

export function BeaconsTab({
  recommendationPayload,
  recommendationDismissed,
  setRecommendationDismissed,
  rsvpBusy,
  setRsvpBusy,
  getAuthHeaders,
  beaconItems,
  tabsLoading,
  openBeaconDetail,
  beaconDetail,
  setBeaconDetail,
}: {
  recommendationPayload: EventRecommendationPayload | undefined;
  recommendationDismissed: boolean;
  setRecommendationDismissed: (dismissed: boolean) => void;
  rsvpBusy: boolean;
  setRsvpBusy: (busy: boolean) => void;
  getAuthHeaders: () => Promise<HeadersInit>;
  beaconItems: BeaconPreviewItem[];
  tabsLoading: boolean;
  openBeaconDetail: (beaconId: string, fallback?: BeaconPreviewItem) => Promise<void>;
  beaconDetail: BeaconDetailState | null;
  setBeaconDetail: (detail: BeaconDetailState | null) => void;
}) {
  return (
    <section role="tabpanel" aria-label="Beacons" className="space-y-3">
      {recommendationPayload?.recommendation && !recommendationDismissed && (
        <div className="rounded-[16px] border border-border-hard bg-surface-container p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Go together?</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">
            {(recommendationPayload.recommendation.peer_name ?? 'They')} are going to{' '}
            {recommendationPayload.recommendation.title}
          </p>
          {(recommendationPayload.recommendation.event_start_at ||
            recommendationPayload.recommendation.location_name) && (
            <p className="mt-1 text-xs text-on-surface-variant">
              {[
                recommendationPayload.recommendation.event_start_at
                  ?.slice(0, 16)
                  ?.replace('T', ' '),
                recommendationPayload.recommendation.location_name
                  ?.trim()
                  .toLowerCase() === 'current location'
                  ? null
                  : recommendationPayload.recommendation.location_name?.trim(),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={rsvpBusy}
              onClick={() => {
                const beaconId = recommendationPayload.recommendation?.beacon_id;
                if (!beaconId) return;
                setRsvpBusy(true);
                void (async () => {
                  try {
                    const headers = await getAuthHeaders();
                    await fetch(`/api/beacons/${encodeURIComponent(beaconId)}/rsvp`, {
                      method: 'POST',
                      headers: {
                        ...headers,
                        'Content-Type': 'application/json',
                      },
                      body: '{}',
                    });
                    setRecommendationDismissed(true);
                    void openBeaconDetail(beaconId);
                  } finally {
                    setRsvpBusy(false);
                  }
                })();
              }}
              className="flex-1 rounded-[10px] border border-border-hard bg-primary px-3 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"
            >
              {rsvpBusy ? 'RSVPing…' : 'RSVP'}
            </button>
            <button
              type="button"
              onClick={() => setRecommendationDismissed(true)}
              className="rounded-[10px] border border-border-hard bg-surface px-3 py-2 text-sm font-semibold text-on-surface"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {beaconItems.length === 0 && tabsLoading ? (
        <EmptyTabState
          Icon={MapPin}
          title="Loading shared beacons"
          body="Pulling events shared in this conversation."
        />
      ) : beaconItems.length === 0 ? (
        <EmptyTabState
          Icon={MapPin}
          title="No shared beacons"
          body="Events and map pins shared in this chat show up here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {beaconItems.map((b) => (
            <li key={b.beaconId}>
              <button
                type="button"
                onClick={() => void openBeaconDetail(b.beaconId, b)}
                className="flex w-full items-stretch gap-3 overflow-hidden rounded-[12px] border border-border-hard bg-surface-container text-left hover:border-primary"
              >
                {/* Same generated identity the beacon carries on the map and on mobile. */}
                <CardVisualHero
                  id={b.beaconId}
                  imageUrl={b.imageUrl}
                  className="flex w-12 shrink-0 items-center justify-center"
                >
                  <div className="flex h-full items-center justify-center px-3">
                    <MapPin className="h-4 w-4 text-white" aria-hidden />
                  </div>
                </CardVisualHero>
                <div className="min-w-0 flex-1 px-1 py-2.5 pr-3">
                  <p className="truncate text-sm font-semibold text-on-surface">{b.title}</p>
                  {(b.scheduleLabel || b.locationLabel) && (
                    <p className="mt-0.5 text-[11px] text-on-surface-variant">
                      {[b.scheduleLabel, b.locationLabel].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {b.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">
                      {b.description}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {beaconDetail && (
        <div className="overflow-hidden rounded-[16px] border border-border-hard bg-surface">
          {/*
            Decorative header: it carries the category chip only. Title, schedule, and
            location live in the structured block below, so putting them here too
            would print the same event name twice on one panel.
          */}
          <CardVisualHero
            id={beaconDetail.beaconId}
            className="h-16"
            imageUrl={beaconDetail.imageUrl}
            chipLabel={beaconDetail.expired ? 'Past event' : 'Event'}
          >
            <div className="flex h-full items-start justify-end p-2.5">
              <button
                type="button"
                onClick={() => setBeaconDetail(null)}
                className="rounded-[8px] bg-black/40 p-1 text-white"
                aria-label="Close event detail"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardVisualHero>
          <div className="p-4">
            <p className="text-base font-semibold text-on-surface">{beaconDetail.title}</p>
            {beaconDetail.loading ? (
              <p className="mt-3 text-sm text-on-surface-variant">Loading…</p>
            ) : beaconDetail.error ? (
              <p className="mt-3 text-sm text-error">{beaconDetail.error}</p>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-on-surface">
                {beaconDetail.schedule && (
                  <p className="text-on-surface-variant">{beaconDetail.schedule}</p>
                )}
                {beaconDetail.location && (
                  <p className="flex items-start gap-2 text-on-surface-variant">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>{beaconDetail.location}</span>
                  </p>
                )}
                {beaconDetail.description && <p>{beaconDetail.description}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
