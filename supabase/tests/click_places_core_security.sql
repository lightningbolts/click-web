BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(22);

-- Fixtures: two users, one connection, and a verified + listed Place at (47.6588, -122.3131) r=75 m.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
    ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'places-a@example.test', '', now(), now()),
    ('a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'places-b@example.test', '', now(), now());

INSERT INTO public.connections (id, created, expiry, user_ids, status)
VALUES (
    'a3000000-0000-4000-8000-000000000003',
    (extract(epoch FROM now()) * 1000)::bigint,
    (extract(epoch FROM now() + interval '1 day') * 1000)::bigint,
    ARRAY['a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002'],
    'active'
);

INSERT INTO public.places (id, name, slug, category, latitude, longitude, radius_meters, verification_status, listed)
VALUES
    ('b1000000-0000-4000-8000-000000000001', 'Café Allegro', 'cafe-allegro-seattle', 'cafe', 47.6588, -122.3131, 75, 'verified', true),
    -- Verified but unlisted, ~2 km away.
    ('b2000000-0000-4000-8000-000000000002', 'Back Room', 'back-room-seattle', 'bar', 47.6768, -122.3131, 75, 'verified', false);

-- Flag ships dark.
SELECT is((SELECT enabled FROM public.feature_flags WHERE key = 'click_places'), false, 'click_places ships dark');

-- RLS and grants.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.place_pulses'::regclass), 'place_pulses has RLS');
SELECT ok(NOT has_table_privilege('authenticated', 'public.place_pulses', 'SELECT'), 'clients cannot read Pulses');
SELECT ok(NOT has_table_privilege('authenticated', 'public.place_check_ins', 'INSERT'), 'clients cannot write check-ins');
SELECT ok(NOT has_function_privilege('authenticated', 'public.places_nearby(double precision, double precision, double precision, integer)', 'EXECUTE'), 'places_nearby is service role only');
SELECT ok(NOT has_function_privilege('authenticated', 'public.backfill_place_encounters(uuid)', 'EXECUTE'), 'backfill is service role only');
SELECT is(
    (SELECT count(*)::int FROM pg_policy WHERE polrelid = 'public.place_check_ins'::regclass AND polname = 'venue_check_ins_select_managers'),
    0,
    'managers have no per-row check-in policy'
);
SELECT is((SELECT public FROM storage.buckets WHERE id = 'place-photos'), true, 'place-photos bucket is public-read');

-- Constraints.
SELECT throws_ok(
    $$INSERT INTO public.places (name, verification_status, listed) VALUES ('Incomplete', 'verified', true)$$,
    '23514', NULL, 'listing requires coordinates, slug and category'
);
SELECT throws_ok(
    $$INSERT INTO public.places (name, verification_status, listed, slug, category, latitude, longitude) VALUES ('Draft', 'draft', true, 'draft-place', 'cafe', 47.6, -122.3)$$,
    '23514', NULL, 'listing requires verification'
);
SELECT throws_ok(
    $$INSERT INTO public.places (name, radius_meters) VALUES ('Huge', 5000)$$,
    '23514', NULL, 'radius is capped at 750 m'
);
SELECT throws_ok(
    $$INSERT INTO public.places (name, slug) VALUES ('Bad slug', 'Bad Slug!')$$,
    '23514', NULL, 'slug format is enforced'
);

-- One open check-in per user per Place.
INSERT INTO public.place_check_ins (place_id, user_id, checked_at, expires_at, proof, proof_weight)
VALUES ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', now(), now() + interval '3 hours', 'gps', 0.8);
SELECT throws_ok(
    $$INSERT INTO public.place_check_ins (place_id, user_id, checked_at, expires_at, proof, proof_weight)
      VALUES ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', now(), now() + interval '3 hours', 'gps', 0.8)$$,
    '23505', NULL, 'a second open check-in at the same Place is rejected'
);
SELECT lives_ok(
    $$UPDATE public.place_check_ins SET checked_out_at = now(), checkout_reason = 'user'
      WHERE user_id = 'a1000000-0000-4000-8000-000000000001';
      INSERT INTO public.place_check_ins (place_id, user_id, checked_at, expires_at, proof, proof_weight)
      VALUES ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', now(), now() + interval '3 hours', 'qr', 1.0)$$,
    'a new check-in is allowed once the previous one is closed'
);

-- A signed-in user sees only their own check-ins.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT is((SELECT count(*)::int FROM public.place_check_ins), 0, 'another user cannot read my check-ins');
RESET ROLE;

-- places_nearby excludes unlisted Places.
SELECT is(
    (SELECT array_agg(place_id ORDER BY distance_meters) FROM public.places_nearby(47.6588, -122.3131, 5000, 100)),
    ARRAY['b1000000-0000-4000-8000-000000000001']::uuid[],
    'places_nearby returns only listed Places'
);

-- Encounter trigger: inside the radius (~30 m) is attributed, outside (~300 m) is not.
INSERT INTO public.connection_encounters (id, connection_id, encountered_at, gps_lat, gps_lon)
VALUES
    ('c1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', now() - interval '9 hours', 47.65907, -122.3131),
    ('c2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003', now() - interval '6 hours', 47.6615, -122.3131),
    ('c3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', now() - interval '4 hours', 0, 0);
SELECT is(
    (SELECT place_id FROM public.connection_encounters WHERE id = 'c1000000-0000-4000-8000-000000000001'),
    'b1000000-0000-4000-8000-000000000001'::uuid,
    'an encounter inside the radius is attributed to the Place'
);
SELECT is(
    (SELECT place_id FROM public.connection_encounters WHERE id = 'c2000000-0000-4000-8000-000000000002'),
    NULL::uuid,
    'an encounter outside the radius is not attributed'
);
SELECT is(
    (SELECT place_id FROM public.connection_encounters WHERE id = 'c3000000-0000-4000-8000-000000000003'),
    NULL::uuid,
    'a 0,0 coordinate is never attributed'
);

-- Backfill after a radius change re-attributes history.
UPDATE public.places SET radius_meters = 400 WHERE id = 'b1000000-0000-4000-8000-000000000001';
SELECT is(
    public.backfill_place_encounters('b1000000-0000-4000-8000-000000000001'),
    2,
    'backfill counts both encounters now inside the larger radius'
);
SELECT is(
    (SELECT place_id FROM public.connection_encounters WHERE id = 'c2000000-0000-4000-8000-000000000002'),
    'b1000000-0000-4000-8000-000000000001'::uuid,
    'the farther encounter is attributed after the radius grows'
);

-- Place Hubs are hidden from the standalone nearby-hub list.
SELECT has_column('public', 'hub_venues', 'place_id', 'hub_venues links to a Place');

SELECT * FROM finish();
ROLLBACK;
