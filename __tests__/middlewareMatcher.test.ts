/**
 * The middleware matcher must stay narrow (spec §11.4) yet still cover every
 * rate-limited API prefix. Read as text because `config` must be a static literal.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { READ_HEAVY_API_PREFIXES } from '@/lib/server/readHeavyRateLimit';

const source = readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8');
const matcher = [...source.slice(source.indexOf('matcher:')).matchAll(/'([^']+)'/g)].map((m) => m[1]);

describe('middleware matcher', () => {
  it('covers every rate-limited API prefix', () => {
    for (const prefix of [...READ_HEAVY_API_PREFIXES, '/api/connections']) {
      expect(matcher).toContain(`${prefix}/:path*`);
    }
  });

  it.each(['/events', '/e/', '/p/', '/c/', '/about', '/privacy', '/terms', '/_next', '/api/:path*'])(
    'does not run on public path %s',
    (p) => {
      expect(matcher.some((m) => m.startsWith(p))).toBe(false);
    },
  );

  it('gates admin and business', () => {
    expect(matcher).toEqual(expect.arrayContaining(['/admin/:path*', '/business/:path*']));
  });
});
