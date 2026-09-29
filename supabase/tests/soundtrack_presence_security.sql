BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(4);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.beacon_presence'::regclass), 'beacon_presence has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.beacon_presence', 'SELECT'), 'clients cannot read who is listening');
SELECT ok(NOT has_table_privilege('authenticated', 'public.beacon_presence', 'INSERT'), 'clients cannot write presence directly');
SELECT is((SELECT enabled FROM public.feature_flags WHERE key = 'soundtrack_presence'), false, 'soundtrack_presence ships dark');

SELECT * FROM finish();
ROLLBACK;
