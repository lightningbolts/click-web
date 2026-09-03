/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const migrationsDir = path.join(repoRoot, 'supabase/migrations');
const bootstrapName = '20260330000000_legacy_schema_bootstrap.sql';
const securityHardeningName = '20260612090000_security_hardening_rls.sql';
const waitlistSignupName = '20260901400000_waitlist_signup_security.sql';

function readMigration(name: string): string {
  return fs.readFileSync(path.join(migrationsDir, name), 'utf8');
}

describe('tracked Supabase migration chain', () => {
  const migrationNames = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  it('starts a fresh reset with the tracked legacy foundation', () => {
    expect(migrationNames[0]).toBe(bootstrapName);
    expect(migrationNames.indexOf(bootstrapName)).toBeLessThan(
      migrationNames.indexOf('20260331120000_insights_venues_rbac.sql'),
    );

    const bootstrap = readMigration(bootstrapName);
    for (const table of [
      'users',
      'profiles',
      'connections',
      'connection_encounters',
      'chats',
      'messages',
      'connection_archives',
      'connection_hidden',
      'user_blocks',
      'user_interests',
      'notification_preferences',
      'waitlist',
    ]) {
      expect(bootstrap).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, 'i'),
      );
    }
  });

  it('uses a unique timestamp for every tracked migration', () => {
    const versions = migrationNames.map((name) => name.split('_', 1)[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('commits new beacon enum values before the legacy backfill uses them', () => {
    const enumMigration = migrationNames.indexOf(
      '20260502000000_split_hazard_utility_beacon_types.sql',
    );
    const backfillMigration = migrationNames.indexOf(
      '20260502120000_backfill_hazard_utility_beacon_types.sql',
    );
    expect(enumMigration).toBeGreaterThanOrEqual(0);
    expect(backfillMigration).toBeGreaterThan(enumMigration);
    expect(readMigration('20260502000000_split_hazard_utility_beacon_types.sql')).not.toContain(
      "'hazard'::public.map_beacon_type",
    );
    expect(readMigration('20260502120000_backfill_hazard_utility_beacon_types.sql')).toContain(
      "'hazard'::public.map_beacon_type",
    );
  });

  it('keeps the foundation upgrade-safe and additive', () => {
    const bootstrap = readMigration(bootstrapName);
    expect(bootstrap).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE)\b/im);
    expect(bootstrap).not.toContain('CASCADE;');
    expect(bootstrap).toContain('WHEN duplicate_object THEN NULL');
    expect(bootstrap).toContain('IF NOT EXISTS');
    expect(bootstrap).not.toContain('CREATE POLICY');
    expect(bootstrap).not.toMatch(/\bGRANT\b/i);
    expect(bootstrap).not.toContain('ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;');
  });

  it('orders waitlist signup access after security hardening', () => {
    expect(migrationNames.indexOf(waitlistSignupName)).toBeGreaterThan(
      migrationNames.indexOf(securityHardeningName),
    );

    const waitlistSignup = readMigration(waitlistSignupName);
    const dropPolicy = 'DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;';
    const createPolicy = /CREATE POLICY "Anyone can join waitlist"\s+ON public\.waitlist FOR INSERT\s+TO anon\s+WITH CHECK \(true\);/;
    expect(waitlistSignup).toContain(dropPolicy);
    expect(waitlistSignup).toMatch(createPolicy);
    expect(waitlistSignup.indexOf(dropPolicy)).toBeLessThan(
      waitlistSignup.search(createPolicy),
    );
    expect(waitlistSignup).toContain('GRANT INSERT ON public.waitlist TO anon;');
    expect(waitlistSignup).not.toContain('Authenticated users can view waitlist');
    expect(waitlistSignup).not.toContain('GRANT SELECT ON public.waitlist TO authenticated;');
  });

  it('executes the tracked bootstrap in an existing-object upgrade fixture', () => {
    const upgradeFixture = fs.readFileSync(
      path.join(repoRoot, 'supabase/tests/migration_paths.sql'),
      'utf8',
    );
    expect(upgradeFixture).toContain('\\ir .migration_paths_bootstrap_fixture');
    expect(upgradeFixture).toContain('migration_paths_upgrade_sentinel');
    expect(upgradeFixture).toContain('upgrade rerun preserves pre-existing waitlist data');
    expect(upgradeFixture).toContain('upgrade rerun preserves pre-existing waitlist policy');
    expect(upgradeFixture).toContain('upgrade rerun does not reintroduce blanket waitlist read policy');
  });
});
