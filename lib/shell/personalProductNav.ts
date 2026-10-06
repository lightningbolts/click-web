/**
 * Legacy dashboard panes still hosted by the `(app)` layout (spec §13). Clicks, hubs, Add and
 * Settings have their own routes now; the map moves out in phase 6.
 */
export type DashboardTab = 'map';

/** Which legacy pane an `(app)` route shows, or null when the route has its own page. */
export function dashboardTabForPath(pathname: string): DashboardTab | null {
  if (pathname === '/map') return 'map';
  return null;
}
