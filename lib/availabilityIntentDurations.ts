/**
 * Mirrors `AvailabilityIntentDuration` in the mobile app (compose AvailabilityViewModel).
 * Keep labels and millisecond values in sync for cross-platform UX.
 */
export const AVAILABILITY_INTENT_DURATION_PRESETS: { label: string; ms: number }[] = [
  { label: '15 min', ms: 15 * 60_000 },
  { label: '30 min', ms: 30 * 60_000 },
  { label: '45 min', ms: 45 * 60_000 },
  { label: '1 hour', ms: 60 * 60_000 },
  { label: '90 min', ms: 90 * 60_000 },
  { label: '2 hours', ms: 2 * 60 * 60_000 },
  { label: '3 hours', ms: 3 * 60 * 60_000 },
  { label: '6 hours', ms: 6 * 60 * 60_000 },
  { label: '24 hours', ms: 24 * 60 * 60_000 },
];

export const DEFAULT_AVAILABILITY_INTENT_DURATION_MS =
  AVAILABILITY_INTENT_DURATION_PRESETS.find((p) => p.label === '3 hours')?.ms ?? 3 * 60 * 60_000;
