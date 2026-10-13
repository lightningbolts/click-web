/** `/clicks` routing (spec §6.3 / §7.2): the inbox filter and which thread is open. */

export type ClicksFilter = 'active' | 'groups' | 'hubs' | 'archived';

export type ClicksThread = { kind: 'c' | 'g' | 'h'; id: string };

const FILTERS = new Set<ClicksFilter>(['active', 'groups', 'hubs', 'archived']);

export function parseClicksFilter(raw: string | null | undefined): ClicksFilter {
  return raw && FILTERS.has(raw as ClicksFilter) ? (raw as ClicksFilter) : 'active';
}

/** The thread a `/clicks/{c|g|h}/{id}` path names, or null on the bare inbox. */
export function parseClicksThread(pathname: string): ClicksThread | null {
  const match = /^\/clicks\/([cgh])\/([^/?#]+)/.exec(pathname);
  if (!match) return null;
  try {
    return { kind: match[1] as ClicksThread['kind'], id: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/** Tab titles for the inbox and each thread kind: the pages' metadata, and in-place moves. */
export const CLICKS_TITLES = { inbox: 'Clicks · Click', c: 'Chat · Click', g: 'Group · Click', h: 'Hub · Click' } as const;

/** The inbox or one of its threads: the routes `clicks/layout.tsx` renders on its own. */
export function isClicksPath(pathname: string): boolean {
  return pathname === '/clicks' || parseClicksThread(pathname) !== null;
}

/**
 * Moves between `/clicks` routes in place. Their pages render nothing (the workspace reads the
 * URL), so a server round trip would only hold the click until it answered. Next syncs
 * `usePathname`, `useSearchParams` and Back/Forward with these history entries.
 */
export function navigateClicks(href: string, { replace = false }: { replace?: boolean } = {}) {
  const same = href === `${location.pathname}${location.search}`;
  window.history[replace || same ? 'replaceState' : 'pushState'](null, '', href);
}

/** `/clicks` keeps `?filter=` only when it isn't the default. */
export function clicksHref(filter: ClicksFilter): string {
  return filter === 'active' ? '/clicks' : `/clicks?filter=${filter}`;
}

/** Which inbox filter a thread naturally belongs to, for the inbox beside it. */
export function filterForThread(thread: ClicksThread | null, archived: boolean): ClicksFilter | null {
  if (!thread) return null;
  if (thread.kind === 'h') return 'hubs';
  if (thread.kind === 'g') return 'groups';
  return archived ? 'archived' : 'active';
}
