import { threadHref } from './appNav';

/**
 * `/?tab=…` deep links from before panes became routes (spec §6.3). The native apps still open
 * `/?tab=settings` for account deletion, so these must keep working. Returns the new path (with
 * any query it needs) or null when `/` should render as usual.
 */
export function legacyTabRedirect(searchParams: URLSearchParams): string | null {
  const tab = searchParams.get('tab');
  if (tab == null) return null;
  const id = (key: string) => {
    const v = searchParams.get(key)?.trim();
    return v ? encodeURIComponent(v) : null;
  };
  switch (tab) {
    case 'chat': {
      const c = id('c') ?? id('connection');
      return c ? threadHref(c) : '/clicks';
    }
    case 'hubs': {
      const hub = id('hub');
      return hub ? `/clicks?filter=hubs&hub=${hub}` : '/clicks?filter=hubs';
    }
    case 'map':
      return '/map';
    case 'identity':
      return '/add';
    case 'settings':
      return '/settings';
    case 'events':
      return '/events';
    // `memory`, `home` and anything unknown: Home itself, without the stale query.
    default:
      return '/';
  }
}
