/**
 * Shares the Supabase Auth session cookie with sibling sites (kestrel.joinclick.co) by
 * writing it for a parent domain such as `.joinclick.co`.
 *
 * The domain comes from one env var, `AUTH_COOKIE_DOMAIN`, which `next.config.ts` inlines at
 * build time as `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`. Server and browser clients therefore read
 * the same constant: if one wrote host-only cookies and the other domain cookies, the browser
 * would hold two cookies of one name. Unset (local dev, CI) → host-only cookies, as before.
 *
 * The domain only applies on hosts inside it, so a preview Worker on `*.workers.dev` keeps
 * host-only cookies instead of having its session cookie rejected by the browser.
 *
 * Edge-safe: used by `middleware.ts`.
 */

/** Records that this browser's auth cookies were rewritten for the domain. */
export const AUTH_COOKIE_DOMAIN_MARKER = 'click-auth-cookie-domain';

/** `@supabase/ssr` defaults (`DEFAULT_COOKIE_OPTIONS`), repeated for cookies we rewrite. */
const SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/** `AUTH_COOKIE_DOMAIN` as inlined at build time, or undefined when unset. */
export function configuredAuthCookieDomain(): string | undefined {
  // Must stay a literal `process.env.NEXT_PUBLIC_…` access so Next inlines it.
  const raw = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim();
  return raw ? raw : undefined;
}

/**
 * The cookie `Domain` to use on `hostname`: `.joinclick.co` on `joinclick.co` or any of its
 * subdomains, undefined (host-only) anywhere else or when no domain is configured.
 */
export function authCookieDomainFor(
  hostname: string | null | undefined,
  configured: string | undefined = configuredAuthCookieDomain(),
): string | undefined {
  if (!configured || !hostname) return undefined;
  const bare = configured.toLowerCase().replace(/^\.+/, '');
  if (!bare || !bare.includes('.')) return undefined;
  const host = hostname.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (host === bare || host.endsWith(`.${bare}`)) return `.${bare}`;
  return undefined;
}

/** `cookieOptions` for `createServerClient` / `createBrowserClient` on `hostname`. */
export function authCookieOptions(hostname: string | null | undefined): { domain?: string } {
  const domain = authCookieDomainFor(hostname);
  return domain ? { domain } : {};
}

/** Supabase SSR auth cookies: the session (and its `.0`, `.1` chunks) and the PKCE verifier. */
export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith('sb-') && name.includes('-auth-token');
}

/** Names sent more than once in a `Cookie` header (a host-only and a domain copy). */
export function duplicatedCookieNames(cookieHeader: string | null | undefined): Set<string> {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const part of (cookieHeader ?? '').split(';')) {
    const eq = part.indexOf('=');
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    if (!name) continue;
    if (seen.has(name)) duplicated.add(name);
    seen.add(name);
  }
  return duplicated;
}

/**
 * A `Set-Cookie` value that deletes the host-only copy of `name` and nothing else: with no
 * `Domain` attribute it cannot match the `.joinclick.co` cookie of the same name.
 */
export function hostOnlyExpiry(name: string): string {
  return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

type CookieLike = { name: string; value: string };

type ResponseWithCookies = {
  headers: Headers;
  cookies: {
    get(name: string): unknown;
    set(name: string, value: string, options?: Record<string, unknown>): unknown;
  };
};

/**
 * Appends host-only deletions for `names`. Call this last: `NextResponse.cookies.set` rewrites
 * every `Set-Cookie` header from its own map (one entry per name), which would drop these.
 */
export function appendHostOnlyExpiries(response: { headers: Headers }, names: Iterable<string>): void {
  for (const name of new Set(names)) {
    response.headers.append('set-cookie', hostOnlyExpiry(name));
  }
}

/**
 * Moves a browser's auth cookies onto `domain` (middleware, after the session was read and
 * possibly refreshed). Signed-in users from before the switch hold host-only cookies; this
 * writes each one again with `Domain=domain` and deletes the host-only copy, then sets
 * {@link AUTH_COOKIE_DOMAIN_MARKER} so later requests skip the work. It runs again whenever the
 * request carries an auth cookie twice (a host-only copy came back, e.g. from a tab still
 * running the old bundle).
 *
 * @param requestCookies the request's cookies as Supabase left them (refreshed values included)
 * @param originalCookieHeader the request's `Cookie` header before Supabase touched it
 */
export function migrateAuthCookiesToDomain(
  response: ResponseWithCookies,
  requestCookies: readonly CookieLike[],
  originalCookieHeader: string | null,
  domain: string,
  secure: boolean,
): void {
  const originalAuthNames = [...new Set(
    (originalCookieHeader ?? '')
      .split(';')
      .map((part) => part.split('=')[0]?.trim() ?? '')
      .filter(isSupabaseAuthCookieName),
  )];
  if (originalAuthNames.length === 0) return;

  const duplicated = duplicatedCookieNames(originalCookieHeader);
  const marked = requestCookies.some((c) => c.name === AUTH_COOKIE_DOMAIN_MARKER && c.value === domain);
  if (marked && !originalAuthNames.some((name) => duplicated.has(name))) return;

  const options = { domain, path: '/', sameSite: 'lax', httpOnly: false, secure, maxAge: SESSION_COOKIE_MAX_AGE };
  for (const { name, value } of requestCookies) {
    // Supabase already wrote (or deleted) this one with the domain during the refresh.
    if (!isSupabaseAuthCookieName(name) || !value || response.cookies.get(name)) continue;
    response.cookies.set(name, value, options);
  }
  response.cookies.set(AUTH_COOKIE_DOMAIN_MARKER, domain, { ...options, httpOnly: true });
  appendHostOnlyExpiries(response, originalAuthNames);
}
