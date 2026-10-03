-- Activity inbox backfill: what already happened in the last 90 days, written the way the live
-- paths write it (lib/server/activity.ts, prior-connection pushes), so the inbox isn't empty on
-- first open. Idempotent: grouped rows skip a key already present (live rows win); prior
-- requests skip one already recorded for that connection.

CREATE TEMP TABLE activity_names ON COMMIT DROP AS
SELECT id,
       coalesce(nullif(trim(first_name), ''), split_part(nullif(trim(name), ''), ' ', 1), 'Someone') AS first,
       coalesce(nullif(trim(name), ''), nullif(trim(concat_ws(' ', first_name, last_name)), ''), 'Someone') AS full_name
FROM public.users;

-- Reactions on your drops: one row per drop, newest reactor on top.
INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, group_key, created_at)
SELECT d.user_id, 'reaction',
       CASE WHEN r.total = 1 THEN n.first || ' reacted ' || r.emoji || ' to your drop'
            WHEN r.total = 2 THEN n.first || ' and 1 other reacted to your drop'
            ELSE n.first || ' and ' || (r.total - 1) || ' others reacted to your drop' END,
       '',
       jsonb_build_object('type', 'reaction', 'target_kind', 'shared_drop', 'target_id', d.id::text, 'drop_id', d.id::text),
       r.user_id, 'reaction:shared_drop:' || d.id, r.created_at
FROM public.shared_drops d
JOIN LATERAL (
    SELECT x.user_id, x.emoji, x.created_at,
           count(*) OVER () AS total
    FROM public.reactions x
    WHERE x.target_kind = 'shared_drop' AND x.target_id = d.id AND x.user_id <> d.user_id
    ORDER BY x.created_at DESC
    LIMIT 1
) r ON true
JOIN activity_names n ON n.id = r.user_id
WHERE d.deleted_at IS NULL AND r.created_at > now() - INTERVAL '90 days'
ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL DO NOTHING;

-- People going to your events: one row per event.
INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, group_key, created_at)
SELECT b.creator_id, 'event_rsvp',
       CASE WHEN a.total = 1 THEN n.first || ' is going'
            WHEN a.total = 2 THEN n.first || ' and 1 other are going'
            ELSE n.first || ' and ' || (a.total - 1) || ' others are going' END,
       left(coalesce(nullif(trim(b.metadata ->> 'title'), ''), nullif(trim(b.metadata ->> 'event_title'), ''),
                     nullif(trim(b.metadata ->> 'name'), ''), 'Event'), 400),
       jsonb_build_object('type', 'event_rsvp', 'beacon_id', b.id::text),
       a.user_id, 'rsvp:' || b.id, a.created_at
FROM public.map_beacons b
JOIN LATERAL (
    SELECT x.user_id, x.created_at, count(*) OVER () AS total
    FROM public.beacon_attendees x
    WHERE x.beacon_id = b.id AND x.user_id <> b.creator_id
    ORDER BY x.created_at DESC
    LIMIT 1
) a ON true
JOIN activity_names n ON n.id = a.user_id
WHERE a.created_at > now() - INTERVAL '90 days'
ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL DO NOTHING;

-- People asking to join your events, still waiting on you.
INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, group_key, created_at)
SELECT b.creator_id, 'event_rsvp_request',
       CASE WHEN q.total = 1 THEN n.first || ' wants to join'
            WHEN q.total = 2 THEN n.first || ' and 1 other want to join'
            ELSE n.first || ' and ' || (q.total - 1) || ' others want to join' END,
       left(coalesce(nullif(trim(b.metadata ->> 'title'), ''), nullif(trim(b.metadata ->> 'event_title'), ''),
                     nullif(trim(b.metadata ->> 'name'), ''), 'Event'), 400),
       jsonb_build_object('type', 'event_rsvp_request', 'beacon_id', b.id::text),
       q.user_id, 'rsvp_request:' || b.id, q.created_at
FROM public.map_beacons b
JOIN LATERAL (
    SELECT x.user_id, x.created_at, count(*) OVER () AS total
    FROM public.event_rsvp_requests x
    WHERE x.beacon_id = b.id AND x.status = 'pending' AND x.user_id <> b.creator_id
    ORDER BY x.created_at DESC
    LIMIT 1
) q ON true
JOIN activity_names n ON n.id = q.user_id
WHERE q.created_at > now() - INTERVAL '90 days'
ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL DO NOTHING;

-- Friend requests still waiting on you (accept or ignore from the inbox).
INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, created_at)
SELECT c.responder_id::uuid, 'prior_connection_request', 'Prior connection request',
       n.full_name || ' says they already know you',
       jsonb_build_object('type', 'prior_connection_request', 'connection_id', c.id::text, 'sender_user_id', c.initiator_id),
       c.initiator_id::uuid, coalesce(c.created_utc, to_timestamp(c.created / 1000.0))
FROM public.connections c
JOIN activity_names n ON n.id::text = c.initiator_id
WHERE c.source::text = 'prior' AND c.status = 'pending'
  AND c.responder_id IN (SELECT id::text FROM public.users)
  AND coalesce(c.created_utc, to_timestamp(c.created / 1000.0)) > now() - INTERVAL '90 days'
  AND NOT EXISTS (
      SELECT 1 FROM public.activity_items i
      WHERE i.user_id = c.responder_id::uuid AND i.type = 'prior_connection_request'
        AND i.data ->> 'connection_id' = c.id::text
  );

-- Requests you sent that were accepted.
INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, created_at)
SELECT c.initiator_id::uuid, 'prior_connection_accepted', n.full_name || ' accepted your request',
       'You''re connected now. Say hi.',
       jsonb_build_object('type', 'prior_connection_accepted', 'connection_id', c.id::text, 'peer_user_id', c.responder_id),
       c.responder_id::uuid, coalesce(c.created_utc, to_timestamp(c.created / 1000.0))
FROM public.connections c
JOIN activity_names n ON n.id::text = c.responder_id
WHERE c.source::text = 'prior' AND c.status = 'active'
  AND c.initiator_id IN (SELECT id::text FROM public.users)
  AND coalesce(c.created_utc, to_timestamp(c.created / 1000.0)) > now() - INTERVAL '90 days'
  AND NOT EXISTS (
      SELECT 1 FROM public.activity_items i
      WHERE i.user_id = c.initiator_id::uuid AND i.type = 'prior_connection_accepted'
        AND i.data ->> 'connection_id' = c.id::text
  );
