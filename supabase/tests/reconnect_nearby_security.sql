BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(5);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.place_nudges'::regclass), 'place_nudges has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.place_nudges', 'SELECT'), 'nudge history is server only');
SELECT ok(NOT has_table_privilege('authenticated', 'public.nudge_mutes', 'SELECT'), 'mutes are server only');
SELECT is((SELECT enabled FROM public.feature_flags WHERE key = 'reconnect_nearby'), false, 'reconnect_nearby ships dark');
SELECT hasnt_column('public', 'place_nudges', 'lat', 'the viewer''s position is never stored');

SELECT * FROM finish();
ROLLBACK;
