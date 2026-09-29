BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(6);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.shared_drops'::regclass), 'shared_drops has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.shared_drops', 'SELECT'), 'clients never read shared drops directly');
SELECT is((SELECT enabled FROM public.feature_flags WHERE key = 'shared_drops'), false, 'shared_drops ships dark');

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-00000000f001', 'shared-cap@example.test');
INSERT INTO public.shared_drops (user_id, audience, client_drop_id, original_path, preview_path, reveal_at)
SELECT '00000000-0000-4000-8000-00000000f001', 'all', gen_random_uuid(), 'shared/o/' || n, 'shared/p/' || n, now() + interval '1 day'
FROM generate_series(1, 3) AS n;

SELECT throws_ok(
    $$INSERT INTO public.shared_drops (user_id, audience, client_drop_id, original_path, preview_path, reveal_at)
      VALUES ('00000000-0000-4000-8000-00000000f001', 'core', gen_random_uuid(), 'shared/o/4', 'shared/p/4', now() + interval '1 day')$$,
    '23514',
    'shared drop daily cap reached',
    'the fourth drop in a day is rejected'
);

UPDATE public.shared_drops SET deleted_at = now() WHERE original_path = 'shared/o/1';
SELECT throws_ok(
    $$INSERT INTO public.shared_drops (user_id, audience, client_drop_id, original_path, preview_path, reveal_at)
      VALUES ('00000000-0000-4000-8000-00000000f001', 'all', gen_random_uuid(), 'shared/o/5', 'shared/p/5', now() + interval '1 day')$$,
    '23514',
    'shared drop daily cap reached',
    'deleting a drop does not free a slot the same day'
);

UPDATE public.shared_drops SET created_at = now() - interval '25 hours' WHERE original_path IN ('shared/o/2', 'shared/o/3');
SELECT lives_ok(
    $$INSERT INTO public.shared_drops (user_id, audience, client_drop_id, original_path, preview_path, reveal_at)
      VALUES ('00000000-0000-4000-8000-00000000f001', 'all', gen_random_uuid(), 'shared/o/6', 'shared/p/6', now() + interval '1 day')$$,
    'the cap is a rolling 24 hours'
);

SELECT * FROM finish();
ROLLBACK;
