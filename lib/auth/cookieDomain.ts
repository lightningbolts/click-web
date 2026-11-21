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

/**
 * True when the request's auth cookies cannot be one coherent session: a name sent twice
 * (host-only + domain copy), or one session sent both whole (`…-auth-token`) and chunked
 * (`…-auth-token.0`). Supabase would merge chunks of two sessions, or prefer a stale whole
 * cookie, so these must be cleared before the session is read.
 */
export function hasConflictingAuthCookies(cookieHeader: string | null | undefined): boolean {
  const names = (cookieHeader ?? '')
    .split(';')
    .map((part) => part.split('=')[0]?.trim() ?? '')
    .filter(isSupabaseAuthCookieName);
  if (new Set(names).size !== names.length) return true;
  const whole = new Set(names.filter((name) => !/\.\d+$/.test(name)));
  return names.some((name) => /\.\d+$/.test(name) && whole.has(name.replace(/\.\d+$/, '')));
}

/**
 * Set (briefly, host-only) when middleware deletes the host-only auth cookies and reloads, so a
 * conflict that survives the reload is read as-is instead of redirecting forever.
 */
export const AUTH_COOKIE_CLEANUP_MARKER = 'click-auth-cookie-cleanup';

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
 * request's auth cookies conflict ({@link hasConflictingAuthCookies}: a host-only copy came
 * back, e.g. from a tab still running the old bundle).
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

  const marked = requestCookies.some((c) => c.name === AUTH_COOKIE_DOMAIN_MARKER && c.value === domain);
  if (marked && !hasConflictingAuthCookies(originalCookieHeader)) return;

  const options = { domain, path: '/', sameSite: 'lax', httpOnly: false, secure, maxAge: SESSION_COOKIE_MAX_AGE };
  for (const { name, value } of requestCookies) {
    // Supabase already wrote (or deleted) this one with the domain during the refresh.
    if (!isSupabaseAuthCookieName(name) || !value || response.cookies.get(name)) continue;
    response.cookies.set(name, value, options);
  }
  response.cookies.set(AUTH_COOKIE_DOMAIN_MARKER, domain, { ...options, httpOnly: true });
  appendHostOnlyExpiries(response, originalAuthNames);
}

type WrittenCookie = { name: string; value: string; options: Record<string, unknown> };

/**
 * A `cookies` adapter for Route Handlers that write a new session (login, auth callback): it
 * reads the request's cookies, sees its own writes, and queues them for {@link applyAuthCookies}
 * instead of going through `cookies()`, so the raw host-only deletions can be appended after.
 */
export function collectingCookieAdapter(request: { cookies: { getAll(): CookieLike[] } }) {
  const written: WrittenCookie[] = [];
  const current = new Map(request.cookies.getAll().map((c) => [c.name, c.value]));
  return {
    written,
    getAll(): CookieLike[] {
      return [...current].filter(([, value]) => value !== '').map(([name, value]) => ({ name, value }));
    },
    setAll(cookiesToSet: WrittenCookie[]): void {
      for (const cookie of cookiesToSet) {
        written.push(cookie);
        current.set(cookie.name, cookie.options.maxAge === 0 ? '' : cookie.value);
      }
    },
  };
}

/**
 * Puts the cookies Supabase wrote on `response`. When they went to a shared `domain`, also deletes
 * every host-only auth cookie the request carried: a browser holding another account's
 * pre-switch session would otherwise keep it beside the new one, and the browser client reads
 * whichever copy comes first (a password reset could change the wrong account).
 */
export function applyAuthCookies(
  response: ResponseWithCookies,
  written: readonly WrittenCookie[],
  requestCookies: readonly CookieLike[],
  domain: string | undefined,
): void {
  for (const { name, value, options } of written) response.cookies.set(name, value, options);
  if (!domain || !written.some((c) => isSupabaseAuthCookieName(c.name))) return;
  response.cookies.set(AUTH_COOKIE_DOMAIN_MARKER, domain, {
    domain, path: '/', sameSite: 'lax', httpOnly: true, maxAge: SESSION_COOKIE_MAX_AGE,
  });
  appendHostOnlyExpiries(response, requestCookies.map((c) => c.name).filter(isSupabaseAuthCookieName));
}
