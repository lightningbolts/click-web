'use client';

import { Clock, Cloud, MapPin, Mountain, Sparkles, Volume2 } from 'lucide-react';
import type {
  buildProfileConnectionLines,
  SharedConnectionPayload,
} from '@/lib/userProfile/formatSharedConnection';
import { formatDetailedEncounterLocation } from '@/lib/location/detailedEncounterLocation';
import CurrentAvailabilitySection from '@/components/dashboard/CurrentAvailabilitySection';
import { FcChip } from '@/components/fc';
import type { ConnectionEncounterRow } from '@/lib/dashboard/connectionEncounters';
import { knownSinceLabel } from '@/lib/connections/priorConnectionMeta';
import type { UserProfilePayload } from '@/lib/userProfile/profileModalTypes';
import { encounterMetricPills, formatEncounterWhen } from '@/lib/userProfile/profileDisplay';

export function TimelineTab({
  profileData,
  isPriorConnection,
  priorSourceLabel,
  priorConfirmed,
  sharedPayload,
  hasMoment,
  momentLines,
  encounterTimeline,
  interestTagKeys,
  sharedInterestTagKeys,
}: {
  profileData: UserProfilePayload;
  isPriorConnection: boolean;
  priorSourceLabel: string;
  priorConfirmed: boolean;
  sharedPayload: SharedConnectionPayload | null;
  hasMoment: boolean;
  momentLines: ReturnType<typeof buildProfileConnectionLines> | null;
  encounterTimeline: { rows: ConnectionEncounterRow[]; originId: string | null } | null;
  interestTagKeys: string[];
  sharedInterestTagKeys: string[];
}) {
  return (
    <>
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          {isPriorConnection ? 'How you know them' : 'When you connected'}
        </h3>
        {isPriorConnection ? (
          <div className="space-y-3 text-sm text-on-surface">
            <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Source</p>
                <p className="mt-0.5 leading-snug">{priorSourceLabel}</p>
              </div>
            </div>
            <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Status</p>
                <p className="mt-0.5 leading-snug">
                  {priorConfirmed ? 'Confirmed by both' : 'Waiting for confirmation'}
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Known since</p>
                <p className="mt-0.5 leading-snug">{knownSinceLabel(sharedPayload?.known_since)}</p>
              </div>
            </div>
            {sharedPayload?.context_tag ? (
              <FcChip>{sharedPayload.context_tag}</FcChip>
            ) : null}
          </div>
        ) : hasMoment && momentLines ? (
          <div className="space-y-3 text-sm text-on-surface">
            {momentLines.context && (
              <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Moment</p>
                  <p className="mt-0.5 leading-snug">{momentLines.context}</p>
                </div>
              </div>
            )}
            {(momentLines.place || momentLines.addressDetail) && (
              <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Place</p>
                  <p className="mt-0.5 leading-snug">
                    {[momentLines.place, momentLines.addressDetail].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            )}
            {momentLines.when && (
              <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Time</p>
                  <p className="mt-0.5 leading-snug">{momentLines.when}</p>
                </div>
              </div>
            )}
            {momentLines.weather && (
              <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
                <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Weather</p>
                  <p className="mt-0.5 leading-snug">{momentLines.weather}</p>
                </div>
              </div>
            )}
            {momentLines.noise && (
              <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
                <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Ambience</p>
                  <p className="mt-0.5 leading-snug">{momentLines.noise}</p>
                </div>
              </div>
            )}
            {momentLines.elevation && (
              <div className="flex gap-3 rounded-[12px] border border-border-hard bg-surface-container px-3 py-2.5">
                <Mountain className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">Elevation</p>
                  <p className="mt-0.5 leading-snug">{momentLines.elevation}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">
            No place or moment details on file for this connection yet.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Interests</h3>
        {profileData.tags.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No interests shared yet</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profileData.tags.map((t, i) => (
              <span
                key={interestTagKeys[i]}
                className="fc-chip text-xs"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </section>

      {!!profileData.sharedInterestTags?.length && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Shared interests
          </h3>
          <p className="mb-2 text-[11px] text-on-surface-variant">
            Conversation starters you both listed
          </p>
          <div className="flex flex-wrap gap-2">
            {(profileData.sharedInterestTags ?? []).map((t, i) => (
              <span
                key={sharedInterestTagKeys[i]}
                className="inline-flex items-center rounded-full border border-border-hard bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface"
              >
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Availability
        </h3>
        <CurrentAvailabilitySection
          availability={profileData.availability}
          availabilityIntents={profileData.availabilityIntents}
        />
      </section>

      <section className="relative">
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Our timeline
        </h3>
        <p className="mb-4 text-[11px] text-on-surface-variant">
          Every time and place you’ve crossed paths
        </p>
        {!encounterTimeline || encounterTimeline.rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            {isPriorConnection
              ? 'No shared physical encounters logged yet. Timeline begins upon your first real-world Handshake.'
              : 'No crossing history on file yet.'}
          </p>
        ) : (
          <div className="relative pl-1">
            <div
              className="pointer-events-none absolute bottom-3 left-[15px] top-2 w-0.5 bg-border-hard transform-gpu translate-z-0"
              aria-hidden
            />
            <ul className="space-y-0">
              {encounterTimeline.rows.map((enc) => {
                const isOrigin = enc.id === encounterTimeline.originId;
                const pills = encounterMetricPills(enc);
                const place =
                  formatDetailedEncounterLocation({
                    locationName: enc.locationName,
                    displayLocation: enc.displayLocation,
                    semanticLocation: enc.semanticLocation,
                  }) ?? 'A new location';
                const momentTags = Array.from(
                  new Set(
                    (enc.contextTags ?? [])
                      .map((t) => (typeof t === 'string' ? t.trim() : ''))
                      .filter(Boolean),
                  ),
                );
                return (
                  <li key={enc.id} className="relative pb-9 last:pb-1">
                    <div
                      className="absolute left-[10px] top-[7px] z-[1] h-3 w-3 rounded-full border border-border-hard bg-primary transform-gpu translate-z-0"
                      aria-hidden
                    />
                    <div className="pl-8">
                      {isOrigin && (
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                          Where it started
                        </p>
                      )}
                      <p className="text-xs tabular-nums text-on-surface-variant">
                        {formatEncounterWhen(enc.encounteredAt)}
                      </p>
                      <p className="mt-1 text-sm font-bold leading-snug text-on-surface">
                        {place}
                      </p>
                      {momentTags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {momentTags.map((tag) => (
                            <span
                              key={`${enc.id}-${tag}`}
                              className="fc-chip !gap-1 !px-2.5 !py-0.5 text-[11px]"
                            >
                              <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {pills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {pills.map(({ metricKey, Icon, label }) => (
                            <span
                              key={`${enc.id}-${metricKey}`}
                              className="inline-flex items-center gap-1 rounded-full border border-border-hard bg-surface-container px-2.5 py-0.5 text-[11px] font-medium text-on-surface"
                            >
                              <Icon
                                className="h-3 w-3 shrink-0 text-on-surface-variant"
                                aria-hidden
                              />
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
