import fs from 'node:fs';
import path from 'node:path';

/**
 * A Server Component that imports a function or constant from a `'use client'` module gets a
 * client reference, not the value: calling it throws at render and the page 500s ("This page
 * couldn't load"). Components (capitalised) are the only values that may cross that boundary.
 */
const ROOT = path.join(__dirname, '../..');
const USE_CLIENT = /^\s*['"]use client['"]/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function resolveAlias(spec: string): string | null {
  if (!spec.startsWith('@/')) return null;
  const base = path.join(ROOT, spec.slice(2));
  return ['.tsx', '.ts', '/index.tsx', '/index.ts'].map((ext) => base + ext).find((p) => fs.existsSync(p)) ?? null;
}

describe('server/client boundary', () => {
  it('server files under app/ import only components from client modules', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'app'))) {
      const source = fs.readFileSync(file, 'utf8');
      if (USE_CLIENT.test(source)) continue;
      for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
        if (match[1]) continue;
        const target = resolveAlias(match[3]);
        if (!target || !USE_CLIENT.test(fs.readFileSync(target, 'utf8'))) continue;
        const values = match[2]
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name && !name.startsWith('type '))
          .map((name) => name.split(/\s+as\s+/)[0]);
        for (const name of values) {
          if (!/^[A-Z][a-z]/.test(name)) offenders.push(`${path.relative(ROOT, file)}: ${name} from ${match[3]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
