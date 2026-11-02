/**
 * The app platform a request came from, from the `X-Click-Platform` header the Android app sends
 * on every click-web request. Anything else (missing, unknown) is null, so server-emitted product
 * events keep `platform: null` exactly as before for clients that don't send it.
 */
export type ClientPlatform = 'ios' | 'android' | 'web';

const PLATFORMS: ReadonlySet<string> = new Set<ClientPlatform>(['ios', 'android', 'web']);

export function clientPlatform(request: Pick<Request, 'headers'>): ClientPlatform | null {
  const raw = request.headers.get('x-click-platform')?.trim().toLowerCase();
  return raw && PLATFORMS.has(raw) ? (raw as ClientPlatform) : null;
}
