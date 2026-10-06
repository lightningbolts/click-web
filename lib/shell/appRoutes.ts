/** Signed-in app routes (spec §6.3 `(app)` group). Edge-safe: middleware imports this. */
export const APP_ROUTE_PREFIXES = ['/clicks', '/map', '/add', '/me', '/settings', '/activity', '/people'] as const;

export function isSignedInAppPath(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
