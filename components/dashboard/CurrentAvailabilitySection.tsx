'use client';

import { motion } from 'framer-motion';
import {
  normalizeAvailabilityIntentRows,
  normalizeLegacyAvailabilityRecord,
} from '@/lib/userProfile/availability';
import { stableKeysForStringList } from '@/lib/react/stableKeysForStringList';

const easeOut = [0.22, 1, 0.36, 1] as const;

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
    return <p className="text-sm text-on-surface-variant">No availability shared yet</p>;
  }

  return (
    <div className="space-y-4 text-sm text-on-surface-variant">
      {intents.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: easeOut }}
        >
          <motion.p
            className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: 0.04, ease: easeOut }}
          >
            Open to
          </motion.p>
          <ul className="flex flex-col gap-2">
            {intents.map((row, i) => (
              <motion.li
                key={row.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: 0.06 + i * 0.05, ease: easeOut }}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border-hard/90 bg-surface-container/40 px-3 py-2"
              >
                <span className="rounded-full border border-[#630ed4]/35 bg-[#630ed4]/10 px-2.5 py-0.5 text-xs text-sky-200">
                  {row.intent_tag.trim()}
                </span>
                <span className="text-xs text-on-surface-variant">{humanizeTimeframe(row.timeframe)}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      ) : null}

      {hasLegacySchedule && legacy ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant mb-2">
            Schedule
          </p>
          <div className="space-y-2">
            {legacy.is_free_this_week === true ? (
              <p className="text-on-surface-variant rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm">
                Free to meet this week
              </p>
            ) : null}
            {Array.isArray(availableDays) && availableDays.length > 0 ? (
              <p className="text-on-surface-variant">
                <span className="text-on-surface-variant">Days: </span>
                {availableDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
              </p>
            ) : null}
            {Array.isArray(preferredActivities) && preferredActivities.length > 0 ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1.5">
                  Activities
                </p>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const keys = stableKeysForStringList(preferredActivities, 'activity');
                    return preferredActivities.map((t, i) => (
                    <span
                      key={keys[i]}
                      className="rounded-full border border-[#630ed4]/35 bg-[#630ed4]/10 px-3 py-1 text-xs text-[#c4b5fd]"
                    >
                      {t}
                    </span>
                    ));
                  })()}
                </div>
              </div>
            ) : null}
            {legacy.custom_status?.trim() ? (
              <p className="text-on-surface border-l-2 border-[#630ed4]/50 pl-3">{legacy.custom_status}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
