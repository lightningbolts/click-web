BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(15);

-- Feature flags: service role only.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.feature_flags'::regclass), 'feature_flags has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.feature_flags', 'SELECT'), 'authenticated cannot read flags');
SELECT ok(NOT has_table_privilege('anon', 'public.feature_flags', 'SELECT'), 'anon cannot read flags');
SELECT is(
    (SELECT enabled FROM public.feature_flags WHERE key = 'drops_develop'),
    false,
    'drops_develop ships dark'
);

-- Develop state: users read only their own rows and never write them directly.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.drop_views'::regclass), 'drop_views has RLS');
SELECT ok(has_table_privilege('authenticated', 'public.drop_views', 'SELECT'), 'authenticated may read own develop state');
SELECT ok(NOT has_table_privilege('authenticated', 'public.drop_views', 'INSERT'), 'authenticated cannot mark drops developed');
SELECT ok(NOT has_table_privilege('authenticated', 'public.drop_views', 'UPDATE'), 'authenticated cannot rewrite developed_at');
SELECT ok(NOT has_table_privilege('anon', 'public.drop_views', 'SELECT'), 'anon cannot read develop state');

-- Gated chat originals: invisible to clients.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_drop_originals'::regclass), 'chat_drop_originals has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.chat_drop_originals', 'SELECT'), 'authenticated cannot see original paths');

-- The click-drops bucket is private and has no client policies at all.
SELECT is((SELECT public FROM storage.buckets WHERE id = 'click-drops'), false, 'click-drops bucket is private');
SELECT is(
    (SELECT count(*)::int FROM pg_policy
      WHERE polrelid = 'storage.objects'::regclass
        AND pg_get_expr(polqual, polrelid) ILIKE '%click-drops%'),
    0,
    'no storage read policy mentions click-drops'
);
SELECT is(
    (SELECT count(*)::int FROM pg_policy
      WHERE polrelid = 'storage.objects'::regclass
        AND pg_get_expr(polwithcheck, polrelid) ILIKE '%click-drops%'),
    0,
    'no storage write policy mentions click-drops'
);

-- Behavioral: even the object's own "owner" cannot list or read it as a signed-in user.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('click-drops', 'chat/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-0000000000aa/1759312800000-abcdef01-original.jpg',
        '00000000-0000-4000-8000-0000000000aa');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
SELECT is(
    (SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'click-drops'),
    0,
    'a signed-in user cannot see click-drops objects, even ones they own'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
