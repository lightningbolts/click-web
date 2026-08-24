/**
 * @jest-environment node
 *
 * Contract: every app/api route.ts must either:
 * - use an auth helper (requireUser, getSupabaseFromRouteRequest, …), or
 * - declare itself public via export { publicRoute } / export const publicRoute, or
 * - match an allowlisted public/cron/webhook pattern.
 *
 * Also forbids local function createAdminClient copies — use
 * @/lib/server/connectionWriteAuth.
 */

import fs from 'fs';
import path from 'path';

const API_ROOT = path.join(process.cwd(), 'app', 'api');

const AUTH_MARKERS = [
  'requireUser',
  'requireBearerUser',
  'getSupabaseFromRouteRequest',
  'getAuthenticatedSupabase',
  'requireConnectionParticipant',
  'requireEventManager',
  'createAdminClient',
  'createAdminSupabaseClient',
  'createServerClient',
  'auth.getUser',
  'exchangeCodeForSession',
  'CRON_SECRET',
  'STRIPE_WEBHOOK_SECRET',
  'constructEvent',
  'publicRoute',
];

/** Intentionally unauthenticated or secret-gated via non-JWT means. */
const PUBLIC_ALLOWLIST = [
  'app/api/waitlist/route.ts',
  'app/api/health/env/route.ts',
  'app/api/webhooks/stripe/route.ts',
  'app/api/beacons/[beaconId]/public/route.ts',
  'app/api/users/[userId]/public-profile/route.ts',
  'app/api/qr/route.ts', // GET mint requires auth inside handler via getAuthenticatedSupabase
];

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRouteFiles(full));
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

describe('API route auth + admin-client contract', () => {
  const routes = walkRouteFiles(API_ROOT);

  it('discovers route handlers', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('has no local createAdminClient() redefinitions under app/api', () => {
    const offenders: string[] = [];
    for (const file of routes) {
      const src = fs.readFileSync(file, 'utf8');
      if (/function\s+createAdminClient\s*\(/.test(src)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every route has an auth marker, publicRoute export, or allowlist entry', () => {
    const missing: string[] = [];
    for (const file of routes) {
      const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
      if (PUBLIC_ALLOWLIST.includes(rel)) continue;
      const src = fs.readFileSync(file, 'utf8');
      const hasMarker = AUTH_MARKERS.some((m) => src.includes(m));
      if (!hasMarker) missing.push(rel);
    }
    expect(missing).toEqual([]);
  });
});
