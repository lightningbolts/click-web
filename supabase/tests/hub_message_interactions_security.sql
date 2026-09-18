BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(25);

SELECT ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hub_message_reactions'::regclass),
    'hub message reactions have RLS enabled'
);
SELECT ok(
    has_table_privilege('authenticated', 'public.hub_message_reactions', 'SELECT'),
    'authenticated may read policy-scoped Hub reactions'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_message_reactions', 'INSERT'),
    'authenticated cannot insert Hub reactions directly'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_message_reactions', 'UPDATE'),
    'authenticated cannot update Hub reactions directly'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_message_reactions', 'DELETE'),
    'authenticated cannot delete Hub reactions directly'
);
SELECT ok(
    has_table_privilege('service_role', 'public.hub_message_reactions', 'INSERT'),
    'service role may persist Hub reactions'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polrelid = 'public.hub_message_reactions'::regclass
          AND polname = 'hub_message_reactions_select_authorized'
          AND polcmd = 'r'
    ),
    'Hub reaction reads use the authoritative access policy'
);
SELECT ok(
    (SELECT relreplident = 'f' FROM pg_class WHERE oid = 'public.hub_message_reactions'::regclass),
    'Hub reactions use full replica identity for deterministic delete payloads'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_messages', 'UPDATE'),
    'authenticated cannot bypass the Hub edit API'
);
SELECT ok(
    NOT has_table_privilege('authenticated', 'public.hub_messages', 'DELETE'),
    'authenticated cannot bypass the Hub delete API'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.hub_message_reactions'::regclass
          AND conname = 'hub_message_reactions_unique'
    ),
    'Hub reactions enforce one row per message/user/reaction'
);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
    ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'hub-reaction-a@example.test', '', now(), now()),
    ('92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'hub-reaction-b@example.test', '', now(), now()),
    ('93000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'hub-reaction-host@example.test', '', now(), now());

INSERT INTO public.map_beacons (id, creator_id, beacon_type, location, expires_at)
VALUES
    (
        'a1000000-0000-4000-8000-000000000001',
        '93000000-0000-4000-8000-000000000003',
        'event',
        ST_SetSRID(ST_MakePoint(-122.3321, 47.6062), 4326)::geography,
        now() + interval '1 day'
    ),
    (
        'a2000000-0000-4000-8000-000000000002',
        '93000000-0000-4000-8000-000000000003',
        'event',
        ST_SetSRID(ST_MakePoint(-122.3321, 47.6062), 4326)::geography,
        now() - interval '1 day'
    );

INSERT INTO public.hub_venues (
    id, name, geofence_lat, geofence_long, radius_meters, creator_id, event_beacon_id, expires_at
)
VALUES
    (
        'hub-reaction-standalone', 'Standalone', 47.6062, -122.3321, 50,
        '91000000-0000-4000-8000-000000000001', NULL, now() + interval '1 day'
    ),
    (
        'hub-reaction-event', 'Event', 47.6062, -122.3321, 50,
        '93000000-0000-4000-8000-000000000003',
        'a1000000-0000-4000-8000-000000000001',
        now() + interval '1 day'
    ),
    (
        'hub-reaction-expired', 'Expired event', 47.6062, -122.3321, 50,
        '93000000-0000-4000-8000-000000000003',
        'a2000000-0000-4000-8000-000000000002',
        now() - interval '1 hour'
    );

INSERT INTO public.hub_participants (hub_id, user_id)
VALUES
    ('hub-reaction-standalone', '91000000-0000-4000-8000-000000000001'),
    ('hub-reaction-event', '92000000-0000-4000-8000-000000000002'),
    ('hub-reaction-expired', '92000000-0000-4000-8000-000000000002');

INSERT INTO public.event_check_ins (beacon_id, user_id, checked_in_at, checked_out_at)
VALUES
    (
        'a1000000-0000-4000-8000-000000000001',
        '92000000-0000-4000-8000-000000000002',
        now(),
        NULL
    ),
    (
        'a2000000-0000-4000-8000-000000000002',
        '92000000-0000-4000-8000-000000000002',
        now() - interval '2 hours',
        NULL
    );

INSERT INTO public.hub_messages (id, hub_id, user_id, body)
VALUES
    (
        '94000000-0000-4000-8000-000000000001',
        'hub-reaction-standalone',
        '91000000-0000-4000-8000-000000000001',
        'standalone fixture'
    ),
    (
        '94000000-0000-4000-8000-000000000002',
        'hub-reaction-event',
        '92000000-0000-4000-8000-000000000002',
        'event attendee fixture'
    ),
    (
        '94000000-0000-4000-8000-000000000003',
        'hub-reaction-expired',
        '92000000-0000-4000-8000-000000000002',
        'expired event fixture'
    ),
    (
        '94000000-0000-4000-8000-000000000004',
        'hub-reaction-standalone',
        '91000000-0000-4000-8000-000000000001',
        'cascade fixture'
    );

INSERT INTO public.hub_message_reactions (
    id, hub_message_id, hub_id, user_id, reaction_type
)
VALUES
    (
        '95000000-0000-4000-8000-000000000001',
        '94000000-0000-4000-8000-000000000001',
        'hub-reaction-standalone',
        '91000000-0000-4000-8000-000000000001',
        '👍'
    ),
    (
        '95000000-0000-4000-8000-000000000002',
        '94000000-0000-4000-8000-000000000002',
        'hub-reaction-event',
        '92000000-0000-4000-8000-000000000002',
        '❤️'
    ),
    (
        '95000000-0000-4000-8000-000000000003',
        '94000000-0000-4000-8000-000000000003',
        'hub-reaction-expired',
        '92000000-0000-4000-8000-000000000002',
        '😮'
    ),
    (
        '95000000-0000-4000-8000-000000000004',
        '94000000-0000-4000-8000-000000000004',
        'hub-reaction-standalone',
        '91000000-0000-4000-8000-000000000001',
        '🔥'
    );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);

SELECT is(
    (SELECT count(*)::integer FROM public.hub_message_reactions WHERE hub_id = 'hub-reaction-standalone'),
    2,
    'current standalone participant can read Hub reactions'
);

SELECT throws_ok(
    $$ INSERT INTO public.hub_message_reactions (
           hub_message_id,
           hub_id,
           user_id,
           reaction_type
       ) VALUES (
           '94000000-0000-4000-8000-000000000001',
           'hub-reaction-standalone',
           '91000000-0000-4000-8000-000000000001',
           '😂'
       ) $$,
    '42501',
    NULL,
    'authenticated cannot insert Hub reactions directly'
);
SELECT throws_ok(
    $$ UPDATE public.hub_messages
       SET body = 'bypass'
       WHERE id = '94000000-0000-4000-8000-000000000001' $$,
    '42501',
    NULL,
    'authenticated cannot update Hub messages directly'
);
SELECT throws_ok(
    $$ DELETE FROM public.hub_messages
       WHERE id = '94000000-0000-4000-8000-000000000001' $$,
    '42501',
    NULL,
    'authenticated cannot delete Hub messages directly'
);

SELECT set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);

SELECT is(
    (SELECT count(*)::integer FROM public.hub_message_reactions WHERE hub_id = 'hub-reaction-standalone'),
    0,
    'nonparticipant cannot read standalone Hub reactions'
);
SELECT ok(
    public.auth_uid_in_hub('hub-reaction-event'),
    'active checked-in Event attendee passes authoritative Hub access'
);
SELECT is(
    (SELECT count(*)::integer FROM public.hub_message_reactions WHERE hub_id = 'hub-reaction-event'),
    1,
    'active checked-in Event attendee can read reaction state used by the interaction API'
);
SELECT ok(
    NOT public.auth_uid_in_hub('hub-reaction-expired'),
    'expired Event attendee fails authoritative Hub access'
);
SELECT is(
    (SELECT count(*)::integer FROM public.hub_message_reactions WHERE hub_id = 'hub-reaction-expired'),
    0,
    'expired Event attendee cannot read Hub reactions'
);
SELECT throws_ok(
    $$ INSERT INTO public.hub_message_reactions (
           hub_message_id,
           hub_id,
           user_id,
           reaction_type
       ) VALUES (
           '94000000-0000-4000-8000-000000000003',
           'hub-reaction-expired',
           '92000000-0000-4000-8000-000000000002',
           '😂'
       ) $$,
    '42501',
    NULL,
    'expired Event attendee cannot bypass the API-only reaction write path'
);

SELECT set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000003', true);
SELECT throws_ok(
    $$ UPDATE public.hub_messages
       SET body = 'creator overwrite'
       WHERE id = '94000000-0000-4000-8000-000000000002' $$,
    '42501',
    NULL,
    'Hub creator has no direct right to edit an attendee message'
);
SELECT throws_ok(
    $$ DELETE FROM public.hub_messages
       WHERE id = '94000000-0000-4000-8000-000000000002' $$,
    '42501',
    NULL,
    'Hub creator has no direct right to delete an attendee message'
);

RESET ROLE;

SET LOCAL ROLE service_role;
SELECT lives_ok(
    $$ INSERT INTO public.hub_message_reactions (
           id,
           hub_message_id,
           hub_id,
           user_id,
           reaction_type
       ) VALUES (
           '95000000-0000-4000-8000-000000000005',
           '94000000-0000-4000-8000-000000000002',
           'hub-reaction-event',
           '92000000-0000-4000-8000-000000000002',
           '😂'
       ) $$,
    'service role can persist an authorized API reaction mutation'
);
RESET ROLE;

DELETE FROM public.hub_messages
WHERE id = '94000000-0000-4000-8000-000000000004';

SELECT is(
    (SELECT count(*)::integer
     FROM public.hub_message_reactions
     WHERE hub_message_id = '94000000-0000-4000-8000-000000000004'),
    0,
    'deleting a Hub message cascades its reactions'
);

SELECT * FROM finish();
ROLLBACK;
