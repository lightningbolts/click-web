/**
 * Legacy dashboard panes still hosted by the `(app)` layout (spec §13). Clicks, hubs and Add
 * have their own routes now; map and settings move out in phases 4 and 6.
 */
export type DashboardTab = 'map' | 'settings';

/** Which legacy pane an `(app)` route shows, or null when the route has its own page. */
export function dashboardTabForPath(pathname: string): DashboardTab | null {
  if (pathname === '/map') return 'map';
  if (pathname === '/settings') return 'settings';
  return null;
}
