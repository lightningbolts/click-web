/**
 * Client-safe Prior Connection labels and enums.
 * Keep Node/server imports out of this file so profile UI can reuse it.
 */

export const KNOWN_SINCE_BUCKETS = [
  'childhood',
  'high_school',
  'college',
  'this_year',
  'unspecified',
] as const;

export type KnownSinceBucket = (typeof KNOWN_SINCE_BUCKETS)[number];

export const KNOWN_SINCE_LABELS: Record<KnownSinceBucket, string> = {
  childhood: 'Childhood',
  high_school: 'High School',
  college: 'College',
  this_year: 'This Year',
  unspecified: 'Unspecified',
};

export const PRIOR_CONNECTION_BADGE_LABEL = 'Prior Connection · Self-Reported';

export function isKnownSinceBucket(value: unknown): value is KnownSinceBucket {
  return typeof value === 'string' && (KNOWN_SINCE_BUCKETS as readonly string[]).includes(value);
}

export function knownSinceLabel(bucket: unknown): string {
  if (isKnownSinceBucket(bucket)) return KNOWN_SINCE_LABELS[bucket];
  return KNOWN_SINCE_LABELS.unspecified;
}
