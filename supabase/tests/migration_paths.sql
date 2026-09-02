BEGIN;

SELECT plan(29);

-- Upgrade-path fixture: the complete chain has already run, so these objects
-- and this sentinel row/policy are pre-existing when the tracked bootstrap is
-- included below. The test runner materializes the exact tracked bootstrap as
-- a sibling fixture because the `supabase test db` container mounts tests but
-- not the repository's migrations directory.
INSERT INTO public.waitlist (email, source)
VALUES ('migration-paths-upgrade-sentinel@example.invalid', 'upgrade-sentinel');

DROP POLICY IF EXISTS migration_paths_upgrade_sentinel ON public.waitlist;
-- Deliberately narrow fixture policy: it proves an existing policy survives
-- without standing in for the removed blanket authenticated-read policy.
CREATE POLICY migration_paths_upgrade_sentinel
    ON public.waitlist FOR SELECT
    TO authenticated
    USING (email = 'migration-paths-upgrade-sentinel@example.invalid');

-- Execute the exact tracked bootstrap against those existing objects/data.
\ir .migration_paths_bootstrap_fixture

-- Fresh-reset coverage: these legacy relations now exist before the first
-- feature migration and remain present after the complete chain.
SELECT has_table('public', 'users', 'fresh path creates public.users');
SELECT has_table('public', 'profiles', 'fresh path creates public.profiles');
SELECT has_table('public', 'connections', 'fresh path creates public.connections');
SELECT has_table('public', 'connection_encounters', 'fresh path creates encounters before early consumers');
SELECT has_table('public', 'chats', 'fresh path creates public.chats');
SELECT has_table('public', 'messages', 'fresh path creates public.messages');
SELECT has_table('public', 'connection_archives', 'fresh path creates archive junction');
SELECT has_table('public', 'connection_hidden', 'fresh path creates hidden junction');
SELECT has_table('public', 'user_blocks', 'fresh path creates public.user_blocks');
SELECT has_table('public', 'user_interests', 'fresh path creates public.user_interests');
SELECT has_table('public', 'notification_preferences', 'fresh path creates notification preferences');
SELECT has_table('public', 'waitlist', 'fresh path tracks the historical waitlist relation');

SELECT has_column('public', 'connections', 'user_ids', 'legacy connections retain TEXT[] participant ids');
SELECT has_column('public', 'connections', 'created', 'legacy connections retain epoch-ms ordering');
SELECT has_column('public', 'connections', 'status', 'legacy connections retain lifecycle status');
SELECT has_column('public', 'connection_encounters', 'connection_id', 'encounters retain connection FK');
SELECT has_type('public', 'connection_lifecycle_status', 'fresh path tracks the legacy lifecycle type');

-- Upgrade-path invariant: the tracked foundation must leave existing policies
-- and data alone; the waitlist remains RLS-protected for both paths.
SELECT ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.waitlist'::regclass),
    'waitlist RLS is enabled on fresh and upgraded schemas'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polrelid = 'public.waitlist'::regclass
          AND polname = 'Anyone can join waitlist'
    ),
    'waitlist signup policy remains available on fresh and upgraded schemas'
);
SELECT is(
    (SELECT polcmd
     FROM pg_policy
     WHERE polrelid = 'public.waitlist'::regclass
       AND polname = 'Anyone can join waitlist'),
    'a',
    'waitlist signup policy is INSERT-only'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polrelid = 'public.waitlist'::regclass
          AND polname = 'Anyone can join waitlist'
          AND polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'anon')]::oid[]
    ),
    'waitlist signup policy targets only anon'
);
SELECT is(
    (SELECT pg_get_expr(polwithcheck, polrelid)
     FROM pg_policy
     WHERE polrelid = 'public.waitlist'::regclass
       AND polname = 'Anyone can join waitlist'),
    'true',
    'waitlist signup policy uses WITH CHECK (true)'
);
SELECT ok(
    has_table_privilege('anon', 'public.waitlist', 'INSERT'),
    'anon has waitlist INSERT privilege'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.waitlist', 'INSERT'),
    'authenticated lacks unintended waitlist INSERT privilege'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.waitlist', 'SELECT'),
    'authenticated lacks unintended waitlist SELECT privilege'
);
SELECT is(
    (SELECT source FROM public.waitlist WHERE email = 'migration-paths-upgrade-sentinel@example.invalid'),
    'upgrade-sentinel',
    'upgrade rerun preserves pre-existing waitlist data'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polrelid = 'public.waitlist'::regclass
          AND polname = 'migration_paths_upgrade_sentinel'
    ),
    'upgrade rerun preserves pre-existing waitlist policy'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polrelid = 'public.waitlist'::regclass
          AND polname = 'Authenticated users can view waitlist'
    ),
    'upgrade rerun does not reintroduce blanket waitlist read policy'
);
SELECT is(
    (SELECT count(*)::integer FROM public.waitlist WHERE email = 'migration-paths-upgrade-sentinel@example.invalid'),
    1,
    'upgrade rerun does not duplicate the sentinel row'
);

SELECT * FROM finish();
ROLLBACK;
