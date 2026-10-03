BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(15);

-- A: the viewer. B, G: A's connections (G in ghost mode). H: hosts the events. S, T: strangers.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
    ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'act-a@example.test', '', now(), now()),
    ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'act-b@example.test', '', now(), now()),
    ('c1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'act-g@example.test', '', now(), now()),
    ('d1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'act-h@example.test', '', now(), now()),
    ('e1000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'act-s@example.test', '', now(), now()),
    ('e1000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'act-t@example.test', '', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, name, email)
VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Avery Viewer', 'act-a@example.test'),
    ('b1000000-0000-4000-8000-000000000002', 'Blake Friend', 'act-b@example.test'),
    ('c1000000-0000-4000-8000-000000000003', 'Gray Ghost', 'act-g@example.test'),
    ('d1000000-0000-4000-8000-000000000004', 'Harper Host', 'act-h@example.test'),
    ('e1000000-0000-4000-8000-000000000005', 'Sam Stranger', 'act-s@example.test'),
    ('e1000000-0000-4000-8000-000000000006', 'Toni Stranger', 'act-t@example.test')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
UPDATE public.users SET ghost_mode = (id = 'c1000000-0000-4000-8000-000000000003')
WHERE id::text LIKE '_1000000-0000-4000-8000-00000000000_';

-- New Clicks: a handshake that goes through is recorded for both people, once.
INSERT INTO public.connections (id, created, expiry, user_ids, status)
VALUES ('f1000000-0000-4000-8000-000000000001', (extract(epoch FROM now()) * 1000)::bigint, 0,
        ARRAY['a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002'], 'pending');
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'new_connection'), 0, 'a pending handshake is not a Click yet');

UPDATE public.connections SET status = 'active' WHERE id = 'f1000000-0000-4000-8000-000000000001';
SELECT is(
    (SELECT title FROM public.activity_items WHERE type = 'new_connection' AND user_id = 'a1000000-0000-4000-8000-000000000001'),
    'You clicked with Blake', 'the viewer sees who they clicked with');
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'new_connection'), 2, 'both people get the Click');

UPDATE public.connections SET status = 'archived' WHERE id = 'f1000000-0000-4000-8000-000000000001';
UPDATE public.connections SET status = 'active' WHERE id = 'f1000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'new_connection'), 2, 'unarchiving is not a new Click');

INSERT INTO public.connections (id, created, expiry, user_ids, status)
VALUES ('f1000000-0000-4000-8000-000000000002', (extract(epoch FROM now()) * 1000)::bigint, 0,
        ARRAY['a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003'], 'active');

-- People you know going: a public event with a public guest list, starting tomorrow.
INSERT INTO public.map_beacons (id, creator_id, beacon_type, location, expires_at, starts_at, ends_at, metadata)
VALUES ('f2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 'event',
        ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
        now() + interval '2 days', now() + interval '1 day', now() + interval '1 day 3 hours',
        '{"title": "Run Club"}'::jsonb);

INSERT INTO public.beacon_attendees (beacon_id, user_id)
VALUES ('f2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000003');
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'friends_going'), 0, 'ghost-mode attendees are never announced');

INSERT INTO public.beacon_attendees (beacon_id, user_id)
VALUES ('f2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000005');
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'friends_going'), 0, 'strangers are never announced');

INSERT INTO public.beacon_attendees (beacon_id, user_id)
VALUES ('f2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002');
SELECT results_eq(
    $$ SELECT title, body, data ->> 'beacon_id' FROM public.activity_items
       WHERE type = 'friends_going' AND user_id = 'a1000000-0000-4000-8000-000000000001' $$,
    $$ VALUES ('Blake is going'::text, 'Run Club'::text, 'f2000000-0000-4000-8000-000000000001'::text) $$,
    'a connection going is one row about the event, without the ghost-mode friend');
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'friends_going'), 1, 'only the viewer hears about it');

DELETE FROM public.beacon_attendees
WHERE beacon_id = 'f2000000-0000-4000-8000-000000000001' AND user_id = 'b1000000-0000-4000-8000-000000000002';
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'friends_going'), 0, 'backing out removes the row');

UPDATE public.map_beacons SET guest_list_visibility = 'hosts_only' WHERE id = 'f2000000-0000-4000-8000-000000000001';
INSERT INTO public.beacon_attendees (beacon_id, user_id)
VALUES ('f2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002');
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'friends_going'), 0, 'a hidden guest list stays hidden');

INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002');
UPDATE public.map_beacons SET guest_list_visibility = 'public' WHERE id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.beacon_attendees
WHERE beacon_id = 'f2000000-0000-4000-8000-000000000001' AND user_id = 'b1000000-0000-4000-8000-000000000002';
INSERT INTO public.beacon_attendees (beacon_id, user_id)
VALUES ('f2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002');
SELECT is((SELECT count(*)::int FROM public.activity_items WHERE type = 'friends_going'), 0, 'blocked people are never announced');
DELETE FROM public.user_blocks WHERE blocker_id = 'a1000000-0000-4000-8000-000000000001';

-- Trending: near a place the viewer has been (an event they joined), with a fresh crowd. Run
-- Club is flagged by moderation, so it's never recommended.
UPDATE public.map_beacons SET flagged = true WHERE id = 'f2000000-0000-4000-8000-000000000001';
INSERT INTO public.map_beacons (id, creator_id, beacon_type, location, expires_at, starts_at, ends_at, metadata)
VALUES ('f2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000004', 'event',
        ST_SetSRID(ST_MakePoint(-122.41, 37.78), 4326)::geography,
        now() + interval '3 days', now() + interval '2 days', now() + interval '2 days 3 hours',
        '{"title": "Night Market"}'::jsonb),
       ('f2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000004', 'event',
        ST_SetSRID(ST_MakePoint(-122.42, 37.77), 4326)::geography,
        now() - interval '20 days', now() - interval '21 days', now() - interval '21 days' + interval '3 hours',
        '{"title": "Past Meetup"}'::jsonb);
INSERT INTO public.beacon_attendees (beacon_id, user_id)
VALUES ('f2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001'),
       ('f2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003'),
       ('f2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000005'),
       ('f2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000006');

SELECT ok(public.record_trending_event_activity() >= 1, 'a picking-up event is recommended');
SELECT is(
    (SELECT title FROM public.activity_items WHERE type = 'event_trending' AND user_id = 'a1000000-0000-4000-8000-000000000001'),
    'Night Market is picking up near you', 'the viewer gets the nearby event');
SELECT is(public.record_trending_event_activity(), 0, 'the same event is never recommended twice');
SELECT is((SELECT count(*)::int FROM public.activity_items
           WHERE type = 'event_trending' AND user_id = 'e1000000-0000-4000-8000-000000000005'), 0,
          'people already going are not told about it');

SELECT * FROM finish();
ROLLBACK;
