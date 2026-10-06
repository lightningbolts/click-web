/**
 * Legacy dashboard panes, now addressed by route (spec §6.3) instead of `/?tab=`.
 * Phase 2 replaces the panes themselves; until then `(app)` routes host them.
 */
export const DASHBOARD_TABS = [
  'memory',
  'events',
  'map',
  'chat',
  'hubs',
  'identity',
  'settings',
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

const TAB_SET = new Set<string>(DASHBOARD_TABS);

export function parseDashboardTab(raw: string | null | undefined): DashboardTab {
  if (raw && TAB_SET.has(raw)) return raw as DashboardTab;
  return 'memory';
}

const TAB_HREF: Record<DashboardTab, string> = {
  memory: '/',
  events: '/events',
  map: '/map',
  chat: '/clicks',
  hubs: '/clicks?filter=hubs',
  identity: '/add',
  settings: '/settings',
};

export function dashboardTabHref(tab: DashboardTab): string {
  return TAB_HREF[tab];
}

/** Which legacy pane an `(app)` route shows, or null when the route has its own page. */
export function dashboardTabForPath(pathname: string, filter?: string | null): DashboardTab | null {
  if (pathname === '/clicks') return filter === 'hubs' ? 'hubs' : 'chat';
  if (pathname === '/map') return 'map';
  if (pathname === '/add') return 'identity';
  if (pathname === '/settings') return 'settings';
  return null;
}
