/**
 * @jest-environment node
 *
 * Contract: JSON body parsing must go through `@/lib/api/parseBody`.
 * Direct `request.json()` / `req.json()` in route handlers is forbidden
 * (outbound `response.json()` / `res.json()` from fetch are fine).
 */

import fs from 'fs';
import path from 'path';

const API_ROOT = path.join(process.cwd(), 'app', 'api');

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRouteFiles(full));
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

describe('API route parseBody contract', () => {
  const routes = walkRouteFiles(API_ROOT);

  it('discovers route handlers', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('forbids direct request.json() / req.json() without parseBody', () => {
    const offenders: string[] = [];
    for (const file of routes) {
      const src = fs.readFileSync(file, 'utf8');
      const usesDirectJson =
        /\brequest\.json\s*\(/.test(src) || /\breq\.json\s*\(/.test(src);
      if (!usesDirectJson) continue;
      const importsParseBody =
        src.includes("@/lib/api/parseBody") || src.includes("'@/lib/api/parseBody'");
      if (!importsParseBody) {
        offenders.push(path.relative(process.cwd(), file).replace(/\\/g, '/'));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('JSON mutation routes that call parseBody import a schema module', () => {
    const offenders: string[] = [];
    for (const file of routes) {
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes('@/lib/api/parseBody')) continue;
      const importsSchema =
        src.includes('@/lib/api/schemas/') ||
        /from ['"]zod['"]/.test(src);
      if (!importsSchema) {
        offenders.push(path.relative(process.cwd(), file).replace(/\\/g, '/'));
      }
    }
    expect(offenders).toEqual([]);
  });
});
