-- Activity inbox keeps everything: what happened since the very first Click, not just the last
-- 90 days. record_activity stops pruning (the (user_id, created_at DESC) index keeps paging
-- cheap at any depth), and the backfills from 20261017000000 / 20261018000000 run again with no
-- time window, plus soundtrack reactions. Idempotent like those: grouped rows skip a key already
-- present (live rows win); ungrouped ones skip what's already recorded.

CREATE OR REPLACE FUNCTION public.record_activity(
    p_user_id   UUID,
    p_type      TEXT,
    p_title     TEXT,
    p_body      TEXT DEFAULT '',
    p_data      JSONB DEFAULT '{}'::jsonb,
    p_actor_id  UUID DEFAULT NULL,
    p_group_key TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, group_key)
    VALUES (p_user_id, p_type, left(p_title, 200), left(coalesce(p_body, ''), 400),
            coalesce(p_data, '{}'::jsonb), p_actor_id, p_group_key)
    ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL
    DO UPDATE SET type = EXCLUDED.type,
                  title = EXCLUDED.title,
                  body = EXCLUDED.body,
                  data = EXCLUDED.data,
                  actor_id = EXCLUDED.actor_id,
                  created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_activity(UUID, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_activity(UUID, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) TO service_role;

CREATE TEMP TABLE activity_names ON COMMIT DROP AS
SELECT u.id,
       coalesce(nullif(trim(j ->> 'first_name'), ''), split_part(nullif(trim(u.name), ''), ' ', 1), 'Someone') AS first,
       coalesce(nullif(trim(u.name), ''), nullif(trim(concat_ws(' ', j ->> 'first_name', j ->> 'last_name')), ''), 'Someone') AS full_name
FROM public.users u, to_jsonb(u) AS j;

-- Reactions on your drops and soundtracks: one row per target, newest reactor on top.
INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, group_key, created_at)
SELECT t.owner_id, 'reaction',
       CASE WHEN r.total = 1 THEN n.first || ' reacted ' || r.emoji || ' to ' || t.what
            WHEN r.total = 2 THEN n.first || ' and 1 other reacted to ' || t.what
            ELSE n.first || ' and ' || (r.total - 1) || ' others reacted to ' || t.what END,
       '',
       jsonb_build_object('type', 'reaction', 'target_kind', t.kind, 'target_id', t.id::text)
           || CASE WHEN t.kind = 'shared_drop' THEN jsonb_build_object('drop_id', t.id::text) ELSE '{}'::jsonb END,
       r.user_id, 'reaction:' || t.kind || ':' || t.id, r.created_at
FROM (
    SELECT d.id, d.user_id AS owner_id, 'shared_drop' AS kind, 'your drop' AS what
    FROM public.shared_drops d WHERE d.deleted_at IS NULL
    UNION ALL
    SELECT b.id, b.creator_id, 'soundtrack', 'your soundtrack'
    FROM public.map_beacons b WHERE b.beacon_type::text = 'soundtrack'
) t
JOIN LATERAL (
    SELECT x.user_id, x.emoji, x.created_at, count(*) OVER () AS total
    FROM public.reactions x
    WHERE x.target_kind = t.kind AND x.target_id = t.id AND x.user_id <> t.owner_id
    ORDER BY x.created_at DESC
    LIMIT 1
) r ON true
JOIN activity_names n ON n.id = r.user_id
WHERE EXISTS (SELECT 1 FROM public.users WHERE id = t.owner_id)
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
WHERE EXISTS (SELECT 1 FROM public.users WHERE id = b.creator_id)
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
WHERE EXISTS (SELECT 1 FROM public.users WHERE id = b.creator_id)
ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL DO NOTHING;

-- Friend requests still waiting on you (accept or ignore from the inbox).
INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, created_at)
SELECT c.responder_id::uuid, 'prior_connection_request', 'Prior connection request',
       n.full_name || ' says they already know you',
       jsonb_build_object('type', 'prior_connection_request', 'connection_id', c.id::text, 'sender_user_id', c.initiator_id::text),
       c.initiator_id::uuid, coalesce(c.created_utc, to_timestamp(c.created / 1000.0))
FROM public.connections c
JOIN activity_names n ON n.id::text = c.initiator_id::text
WHERE c.source::text = 'prior' AND c.status = 'pending'
  AND c.responder_id::text IN (SELECT id::text FROM public.users)
  AND NOT EXISTS (
      SELECT 1 FROM public.activity_items i
      WHERE i.user_id = c.responder_id::uuid AND i.type = 'prior_connection_request'
        AND i.data ->> 'connection_id' = c.id::text
  );

-- Requests you sent that were accepted.
INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, created_at)
SELECT c.initiator_id::uuid, 'prior_connection_accepted', n.full_name || ' accepted your request',
       'You''re connected now. Say hi.',
       jsonb_build_object('type', 'prior_connection_accepted', 'connection_id', c.id::text, 'peer_user_id', c.responder_id::text),
       c.responder_id::uuid, coalesce(c.created_utc, to_timestamp(c.created / 1000.0))
FROM public.connections c
JOIN activity_names n ON n.id::text = c.responder_id::text
WHERE c.source::text = 'prior' AND c.status = 'active'
  AND c.initiator_id::text IN (SELECT id::text FROM public.users)
  AND NOT EXISTS (
      SELECT 1 FROM public.activity_items i
      WHERE i.user_id = c.initiator_id::uuid AND i.type = 'prior_connection_accepted'
        AND i.data ->> 'connection_id' = c.id::text
  );

-- Every Click, dated when it happened.
INSERT INTO public.activity_items (user_id, type, title, data, actor_id, group_key, created_at)
SELECT me::uuid, 'new_connection', 'You clicked with ' || public.activity_first_name(peer::uuid),
       jsonb_build_object('type', 'new_connection', 'connection_id', c.id::text, 'peer_user_id', peer),
       peer::uuid, 'connection:' || c.id,
       coalesce(c.created_utc, to_timestamp(c.created / 1000.0))
FROM public.connections c
CROSS JOIN LATERAL unnest(c.user_ids) AS me
CROSS JOIN LATERAL (SELECT x AS peer FROM unnest(c.user_ids) AS x WHERE x <> me LIMIT 1) p
WHERE c.status::text IN ('active', 'kept')
  AND c.source::text IS DISTINCT FROM 'prior'
  AND NOT coalesce(c.is_group, false)
  AND cardinality(c.user_ids) = 2
  AND EXISTS (SELECT 1 FROM public.users WHERE id::text = me)
  AND EXISTS (SELECT 1 FROM public.users WHERE id::text = p.peer)
ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL DO NOTHING;

COMMENT ON FUNCTION public.record_activity(UUID, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) IS
    'Server only. The one write path for activity_items; grouped rows move to the top. History is kept.';
