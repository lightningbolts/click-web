/**
 * Read-heavy API prefixes share a sliding-window IP budget for GET/HEAD only.
 * Mutations (RSVP, bookmark, check-in) must not share that bucket — map browsing
 * would otherwise 429 legitimate engagement POSTs.
 */
export const READ_HEAVY_API_PREFIXES = [
  '/api/beacons',
  '/api/map/beacons',
  '/api/hub/nearby',
  '/api/livekit/token',
] as const;

export function isReadHeavyApiPath(pathname: string): boolean {
  return READ_HEAVY_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** True when this request should count against the read-heavy rate limit. */
export function shouldApplyReadHeavyRateLimit(
  pathname: string,
  method: string,
): boolean {
  if (!pathname.startsWith('/api/')) return false;
  if (!isReadHeavyApiPath(pathname)) return false;
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD';
}
