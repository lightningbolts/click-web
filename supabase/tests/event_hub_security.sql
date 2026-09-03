BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(11);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'event-a@example.test', '', now(), now()),
    ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'event-b@example.test', '', now(), now());

INSERT INTO public.map_beacons (id, creator_id, beacon_type, location, expires_at)
VALUES
    (
        'a0000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'hobby',
        ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
        now() + interval '1 day'
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002',
        'hobby',
        ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)::geography,
        now() + interval '1 day'
    );

INSERT INTO public.hub_venues (
    id, name, geofence_lat, geofence_long, radius_meters, creator_id, event_beacon_id, expires_at
)
VALUES (
    'event-hub-a', 'Event A', 37.7749, -122.4194, 50,
    '10000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    now() + interval '1 day'
);

INSERT INTO public.hub_participants (hub_id, user_id)
VALUES ('event-hub-a', '20000000-0000-0000-0000-000000000002');

INSERT INTO public.hub_messages (hub_id, user_id, body)
VALUES ('event-hub-a', '10000000-0000-0000-0000-000000000001', 'fixture');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

SELECT is(jsonb_array_length(public.fetch_my_active_map_beacons(50)), 1, 'caller sees only one own beacon');
SELECT is(
    public.fetch_my_active_map_beacons(50)->0->>'creator_id',
    '10000000-0000-0000-0000-000000000001',
    'caller-scoped RPC cannot substitute another creator id'
);
SELECT throws_ok(
    $$ SELECT public.fetch_creator_active_map_beacons('20000000-0000-0000-0000-000000000002', 50) $$,
    '42501',
    NULL,
    'authenticated callers cannot execute the arbitrary-creator RPC'
);
SELECT is((SELECT count(*)::integer FROM public.hub_messages WHERE hub_id = 'event-hub-a'), 1, 'event host can read');

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.hub_messages WHERE hub_id = 'event-hub-a'), 0, 'stale participant cannot read');

RESET ROLE;
INSERT INTO public.event_check_ins (beacon_id, user_id, checked_in_at, checked_out_at)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    now(),
    NULL
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.hub_messages WHERE hub_id = 'event-hub-a'), 1, 'active check-in can read');

RESET ROLE;
UPDATE public.event_check_ins
SET checked_out_at = now()
WHERE beacon_id = 'a0000000-0000-0000-0000-000000000001'
  AND user_id = '20000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.hub_messages WHERE hub_id = 'event-hub-a'), 0, 'check-out revokes reads');
SELECT throws_ok(
    $$ INSERT INTO public.hub_messages (hub_id, user_id, body)
       VALUES ('event-hub-a', '20000000-0000-0000-0000-000000000002', 'must fail') $$,
    '42501',
    NULL,
    'check-out revokes direct writes'
);

RESET ROLE;
SELECT ok(
    NOT has_function_privilege('anon', 'public.auth_uid_in_hub(text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.fetch_map_beacons_within(double precision, double precision, double precision, integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.fetch_my_active_map_beacons(integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.fetch_creator_active_map_beacons(uuid, integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_hubs_nearby(double precision, double precision, double precision, integer)', 'EXECUTE'),
    'anonymous role cannot execute event-hub RPCs'
);

SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polrelid = 'public.waitlist'::regclass
          AND polname = 'Allow public waitlist inserts'
    ),
    'legacy broad waitlist insert policy is absent'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE oid = 'public.sync_user_contact_hashes()'::regprocedure
          AND proconfig @> ARRAY['search_path=public, extensions, pg_temp']::text[]
    ),
    'contact-hash trigger has an explicit pgcrypto search path'
);

SELECT * FROM finish();
ROLLBACK;
