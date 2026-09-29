BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(7);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.beacon_confirmations'::regclass), 'beacon_confirmations has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.beacon_confirmations', 'SELECT'), 'votes are not readable by clients');
SELECT ok(NOT has_table_privilege('authenticated', 'public.beacon_confirmations', 'INSERT'), 'votes are written only by click-web');
SELECT ok(NOT has_table_privilege('anon', 'public.beacon_confirmations', 'SELECT'), 'anon cannot read votes');
SELECT has_column('public', 'map_beacons', 'cleared_at', 'map_beacons records when an alert was cleared');
SELECT is((SELECT enabled FROM public.feature_flags WHERE key = 'alert_confirmations'), false, 'alert_confirmations ships dark');
SELECT is(
    (SELECT (config ->> 'radius_meters')::int FROM public.feature_flags WHERE key = 'alert_confirmations'),
    300,
    'vote radius is tunable config (default 300 m)'
);

SELECT * FROM finish();
ROLLBACK;
