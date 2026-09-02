/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');

describe('apply-supabase-migrations safety contract', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/apply-supabase-migrations.sh'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    devDependencies?: Record<string, string>;
  };

  it('uses the repository-pinned CLI instead of npx @latest', () => {
    expect(packageJson.devDependencies?.supabase).toMatch(/^\d+\.\d+\.\d+$/);
    expect(script).toContain('CLI=(npx --no-install supabase)');
    expect(script).not.toContain('supabase@latest');
  });

  it('executes a real Supabase dry run and refuses an unlinked project', () => {
    expect(script).toContain('"${CLI[@]}" db push --dry-run --include-all');
    expect(script).toContain('Unable to read linked Supabase migration history.');
    expect(script).not.toContain('validating known scale migration only');
  });

  it('parses the numeric remote column rather than looking for a nonexistent Applied label', () => {
    expect(script).toContain('parse_applied_versions()');
    expect(script).toContain("remote=$2");
    expect(script).toContain('remote ~ /^[0-9]+$/');
    expect(script).not.toContain("$0 ~ /Applied/");
  });
});
