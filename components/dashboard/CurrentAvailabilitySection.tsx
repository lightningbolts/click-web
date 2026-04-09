'use client';

import {
  normalizeAvailabilityIntentRows,
  normalizeLegacyAvailabilityRecord,
} from '@/lib/userProfile/availability';

type LegacyAvailability = NonNullable<
  ReturnType<typeof normalizeLegacyAvailabilityRecord>
>;

type Props = {
  availability: LegacyAvailability | null;
  availabilityIntents?: unknown;
};

function humanizeTimeframe(value: string): string {
  const s = value.trim();
  if (!s) return '';
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Dashboard / profile surface for “what I’m open to” — intent rows + legacy schedule.
 * All array fields are normalized so stringified JSON or junk tokens never become per-character chips.
 */
export default function CurrentAvailabilitySection({
  availability,
  availabilityIntents,
}: Props) {
  const intents = normalizeAvailabilityIntentRows(availabilityIntents ?? []);
  const legacy = normalizeLegacyAvailabilityRecord(availability);

  const availableDays = legacy?.available_days;
  const preferredActivities = legacy?.preferred_activities;

  const hasLegacySchedule =
    !!legacy &&
    (legacy.is_free_this_week === true ||
      (Array.isArray(availableDays) && availableDays.length > 0) ||
      (Array.isArray(preferredActivities) && preferredActivities.length > 0) ||
      !!legacy.custom_status?.trim());

  if (intents.length === 0 && !hasLegacySchedule) {
    return <p className="text-sm text-zinc-500">No availability shared yet</p>;
  }

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      {intents.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Open to
          </p>
          <ul className="flex flex-col gap-2">
            {intents.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800/90 bg-zinc-900/40 px-3 py-2"
              >
                <span className="rounded-full border border-[#3A86FF]/35 bg-[#3A86FF]/10 px-2.5 py-0.5 text-xs text-sky-200">
                  {row.intent_tag.trim()}
                </span>
                <span className="text-xs text-zinc-500">{humanizeTimeframe(row.timeframe)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasLegacySchedule && legacy ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Schedule
          </p>
          <div className="space-y-2">
            {legacy.is_free_this_week === true ? (
              <p className="text-zinc-300 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm">
                Free to meet this week
              </p>
            ) : null}
            {Array.isArray(availableDays) && availableDays.length > 0 ? (
              <p className="text-zinc-400">
                <span className="text-zinc-500">Days: </span>
                {availableDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
              </p>
            ) : null}
            {Array.isArray(preferredActivities) && preferredActivities.length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
                  Activities
                </p>
                <div className="flex flex-wrap gap-2">
                  {preferredActivities.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-[#8338EC]/35 bg-[#8338EC]/10 px-3 py-1 text-xs text-[#c4b5fd]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {legacy.custom_status?.trim() ? (
              <p className="text-zinc-200 border-l-2 border-[#8338EC]/50 pl-3">{legacy.custom_status}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
