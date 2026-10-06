/**
 * Old Insights and business URLs → the Place workspace (spec §6.3, §9.5). Imported by
 * `next.config.ts`, so it uses no path aliases. Every row is asserted in `__tests__/redirects.test.ts`.
 */

/** Today's /insights pages → the consolidated section ('' = Insights overview). */
export const INSIGHTS_PAGE_MAP: Record<string, string> = {
  place: '',
  'live-metrics': '',
  heatmap: 'traffic',
  tribes: 'crowd',
  'social-activity': 'crowd',
  'vibe-radar': 'vibe',
  'vibe-stream': 'vibe',
  'event-engagement': 'events',
  events: 'events',
};

type NextRedirect = {
  source: string;
  destination: string;
  permanent: true;
  has?: { type: 'query'; key: string; value?: string }[];
  missing?: { type: 'query'; key: string }[];
};

const withVenue = [{ type: 'query' as const, key: 'venue_id', value: '(?<venueId>[0-9a-fA-F-]{36})' }];
const noVenue = [{ type: 'query' as const, key: 'venue_id' }];

export function businessRedirects(): NextRedirect[] {
  const rows: NextRedirect[] = [
    { source: '/insights', has: withVenue, destination: '/business/places/:venueId/insights', permanent: true },
    { source: '/insights', destination: '/business', permanent: true },
  ];
  for (const [page, section] of Object.entries(INSIGHTS_PAGE_MAP)) {
    const suffix = section ? `/${section}` : '';
    rows.push(
      { source: `/insights/${page}`, has: withVenue, destination: `/business/places/:venueId/insights${suffix}`, permanent: true },
      { source: `/insights/${page}`, missing: noVenue, destination: `/business?to=insights${suffix}`, permanent: true },
    );
  }
  // The retired paid signup; `?checkout=` rides along so in-flight Checkout sessions land (one release).
  rows.push({ source: '/business/signup', destination: '/business/get-started', permanent: true });
  return rows;
}

/** Applies the table to a URL, as Next would (used by tests). Null when nothing matches. */
export function resolveBusinessRedirect(pathname: string, query: URLSearchParams): string | null {
  for (const r of businessRedirects()) {
    if (r.source !== pathname) continue;
    const venue = query.get('venue_id');
    if (r.has && !(venue && /^[0-9a-fA-F-]{36}$/.test(venue))) continue;
    if (r.missing && query.has('venue_id')) continue;
    return r.destination.replace(':venueId', venue ?? '');
  }
  return null;
}
