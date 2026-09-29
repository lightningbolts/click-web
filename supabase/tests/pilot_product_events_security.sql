BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(4);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_events'::regclass), 'product_events has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.product_events', 'SELECT'), 'clients cannot read analytics');
SELECT ok(NOT has_table_privilege('authenticated', 'public.product_events', 'INSERT'), 'clients write only through the API allowlist');
SELECT throws_ok(
    $$INSERT INTO public.product_events (event) VALUES ('page_view')$$,
    '23514',
    NULL,
    'only allowlisted event names are stored'
);

SELECT * FROM finish();
ROLLBACK;
