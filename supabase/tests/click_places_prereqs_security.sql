BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(12);

-- W1 rename: the new tables exist and the old names are compatibility views.
SELECT has_table('public', 'places', 'places table exists');
SELECT has_table('public', 'place_managers', 'place_managers table exists');
SELECT has_view('public', 'venues', 'venues is a compatibility view');
SELECT has_view('public', 'venue_managers', 'venue_managers is a compatibility view');
SELECT has_column('public', 'place_managers', 'place_id', 'place_managers.venue_id was renamed to place_id');

-- W2: privacy columns default to off.
SELECT col_default_is('public', 'users', 'place_visits_visible_to_connections', 'false', 'Place visits are hidden by default');

-- W2: Places and managers are written only by the service role.
SELECT ok(NOT has_table_privilege('authenticated', 'public.places', 'INSERT'), 'authenticated cannot insert places');
SELECT ok(NOT has_table_privilege('authenticated', 'public.places', 'UPDATE'), 'authenticated cannot update places');
SELECT ok(NOT has_table_privilege('authenticated', 'public.venues', 'INSERT'), 'authenticated cannot insert through the venues view');
SELECT ok(NOT has_table_privilege('authenticated', 'public.place_managers', 'INSERT'), 'authenticated cannot insert managers');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
SELECT throws_ok(
    $$INSERT INTO public.places (name, subscription_status) VALUES ('Self-made Place', 'inactive')$$,
    '42501',
    NULL,
    'a signed-in user cannot create a Place directly'
);
SELECT throws_ok(
    $$INSERT INTO public.venues (name, subscription_status) VALUES ('Self-made venue', 'inactive')$$,
    '42501',
    NULL,
    'a signed-in user cannot create a Place through the legacy view'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
