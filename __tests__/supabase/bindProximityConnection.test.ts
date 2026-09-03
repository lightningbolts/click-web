/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

describe('bind-proximity-connection simulator gate', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../supabase/functions/bind-proximity-connection/index.ts'),
    'utf8',
  );

  it('requires the explicit flag and an approved non-production environment', () => {
    expect(source).toContain("new Set(['development', 'test', 'staging'])");
    expect(source).toContain("Deno.env.get('CLICK_ENABLE_SIMULATOR_MOCK') === 'true'");
    expect(source).toContain('APPROVED_SIMULATOR_ENVIRONMENTS.has(appEnvironment)');
    expect(source).toContain('body.simulator_mock === true');
  });

  it('retains the explicit production denial alongside the allowlist', () => {
    expect(source).toContain("Deno.env.get('CLICK_APP_ENV') !== 'production'");
    expect(source).toContain('APPROVED_SIMULATOR_ENVIRONMENTS.has(appEnvironment)');
  });
});
