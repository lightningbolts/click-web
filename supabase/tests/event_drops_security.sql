BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(10);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.event_drops'::regclass), 'event_drops has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.event_drops', 'SELECT'), 'clients never read event drops directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.event_drop_recaps', 'SELECT'), 'recap bookkeeping is server only');
SELECT ok(NOT has_table_privilege('authenticated', 'public.drop_reports', 'SELECT'), 'drop reports are server only');
SELECT is((SELECT enabled FROM public.feature_flags WHERE key = 'event_drops'), false, 'event_drops ships dark');
SELECT is((SELECT enabled FROM public.feature_flags WHERE key = 'event_history'), false, 'event_history ships dark');

-- The per-poster cap holds at the database, not just in the API.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-00000000d001', 'drops-cap@example.test');
INSERT INTO public.map_beacons (id, creator_id, beacon_type, location, expires_at)
VALUES ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', 'event',
        'SRID=4326;POINT(-122.3 47.65)', now() + interval '1 day');

INSERT INTO public.event_drops (beacon_id, user_id, client_drop_id, original_path, preview_path, filter_seed, reveal_at)
SELECT '00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', gen_random_uuid(),
       'event/o/' || n, 'event/p/' || n, n, now() + interval '1 day'
FROM generate_series(1, 10) AS n;

SELECT is(
    (SELECT count(*)::int FROM public.event_drops WHERE user_id = '00000000-0000-4000-8000-00000000d001'),
    10,
    'ten drops are allowed'
);

SELECT throws_ok(
    $$INSERT INTO public.event_drops (beacon_id, user_id, client_drop_id, original_path, preview_path, filter_seed, reveal_at)
      VALUES ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', gen_random_uuid(),
              'event/o/11', 'event/p/11', 11, now() + interval '1 day')$$,
    '23514',
    'event drop cap reached',
    'the eleventh drop is rejected'
);

UPDATE public.event_drops SET deleted_at = now() WHERE original_path = 'event/o/1';
SELECT lives_ok(
    $$INSERT INTO public.event_drops (beacon_id, user_id, client_drop_id, original_path, preview_path, filter_seed, reveal_at)
      VALUES ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', gen_random_uuid(),
              'event/o/12', 'event/p/12', 12, now() + interval '1 day')$$,
    'a deleted drop frees its slot'
);

UPDATE public.event_drops SET deleted_at = now() WHERE original_path = 'event/o/3';
SELECT throws_ok(
    $$INSERT INTO public.event_drops (beacon_id, user_id, client_drop_id, original_path, preview_path, filter_seed, reveal_at)
      SELECT beacon_id, user_id, client_drop_id, 'event/o/13', 'event/p/13', 13, reveal_at
      FROM public.event_drops WHERE original_path = 'event/o/2'$$,
    '23505',
    NULL,
    'a retried upload (same client_drop_id) cannot create a second drop'
);

SELECT * FROM finish();
ROLLBACK;
