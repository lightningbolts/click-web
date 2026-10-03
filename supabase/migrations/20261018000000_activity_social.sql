-- Activity inbox, social: new Clicks, connections going to events, and events trending near you.
-- All three are written here in the database, so every write path (API routes, edge functions,
-- direct inserts) is covered once. None of them pushes; they're inbox-only.
--
-- Privacy rules for "people you know are going" (it must never feel like being watched):
--   * only public events with a public guest list (anyone could already see who's going there),
--     that haven't ended, and that the viewer could see (connections-only events need the host);
--   * only mutual connections (active or kept), never ghost-mode people, never anyone either
--     side blocked; the host's own RSVP isn't news;
--   * one row per event, never a running log of someone's RSVPs, and it's corrected (or
--     removed) when someone backs out.

-- Helpers ----------------------------------------------------------------------------------

-- first_name is read through jsonb: production has it, a clean migration chain doesn't.
CREATE OR REPLACE FUNCTION public.activity_first_name(p_user UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT coalesce((
        SELECT coalesce(nullif(trim(j ->> 'first_name'), ''), nullif(split_part(trim(u.name), ' ', 1), ''))
        FROM public.users u, to_jsonb(u) AS j
        WHERE u.id = p_user
    ), 'Someone');
$$;

CREATE OR REPLACE FUNCTION public.activity_event_title(p_metadata JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
    SELECT left(coalesce(nullif(trim(p_metadata ->> 'title'), ''), nullif(trim(p_metadata ->> 'event_title'), ''),
                         nullif(trim(p_metadata ->> 'name'), ''), 'An event'), 160);
$$;

-- Everyone p_user is connected with one-to-one (active or kept).
CREATE OR REPLACE FUNCTION public.activity_connection_ids(p_user UUID)
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT DISTINCT peer::uuid
    FROM public.connections c, unnest(c.user_ids) AS peer
    WHERE c.user_ids @> ARRAY[p_user::text]
      AND c.status::text IN ('active', 'kept')
      AND NOT coalesce(c.is_group, false)
      AND peer <> p_user::text
      AND peer ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

-- Either side blocked the other.
CREATE OR REPLACE FUNCTION public.activity_blocked(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_blocks
        WHERE (blocker_id = p_a AND blocked_id = p_b) OR (blocker_id = p_b AND blocked_id = p_a)
    );
$$;

-- New Clicks -------------------------------------------------------------------------------

-- "You clicked with Maya", for both people, once per connection. Prior (contacts) requests have
-- their own request/accepted items, and group connections aren't one person.
CREATE OR REPLACE FUNCTION public.record_connection_activity(p_connection UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    c RECORD;
    me TEXT;
    peer UUID;
BEGIN
    SELECT id, user_ids, status::text AS status, source::text AS source, is_group INTO c
    FROM public.connections WHERE id = p_connection;
    IF NOT FOUND OR c.source = 'prior' OR coalesce(c.is_group, false)
       OR c.status::text NOT IN ('active', 'kept') OR cardinality(c.user_ids) <> 2 THEN
        RETURN;
    END IF;

    FOREACH me IN ARRAY c.user_ids LOOP
        peer := (SELECT x::uuid FROM unnest(c.user_ids) AS x WHERE x <> me LIMIT 1);
        INSERT INTO public.activity_items (user_id, type, title, data, actor_id, group_key)
        SELECT me::uuid, 'new_connection', 'You clicked with ' || public.activity_first_name(peer),
               jsonb_build_object('type', 'new_connection', 'connection_id', c.id::text, 'peer_user_id', peer::text),
               peer, 'connection:' || c.id
        WHERE EXISTS (SELECT 1 FROM public.users WHERE id = me::uuid)
          AND EXISTS (SELECT 1 FROM public.users WHERE id = peer)
        ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL DO NOTHING;
    END LOOP;
END;
$$;

-- On creation, or when a pending handshake goes through (not on unarchive or kept).
CREATE OR REPLACE FUNCTION public.trg_connection_activity()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status::text IN ('active', 'kept') AND (TG_OP = 'INSERT' OR OLD.status::text = 'pending') THEN
        BEGIN
            PERFORM public.record_connection_activity(NEW.id);
        EXCEPTION WHEN OTHERS THEN
            -- Activity is a side effect: it must never fail the connection itself.
            RAISE WARNING 'connection activity %: %', NEW.id, SQLERRM;
        END;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_activity ON public.connections;
CREATE TRIGGER trg_connection_activity
    AFTER INSERT OR UPDATE OF status ON public.connections
    FOR EACH ROW EXECUTE FUNCTION public.trg_connection_activity();

-- People you know going to events ----------------------------------------------------------

-- Recomputes "Maya and 2 others you know are going" for each connection of p_attendee, after
-- they joined (p_bump: the row moves to the top) or left (the row is corrected in place, or
-- removed when nobody they know is going any more).
CREATE OR REPLACE FUNCTION public.refresh_friends_going(p_beacon UUID, p_attendee UUID, p_bump BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    e RECORD;
    r RECORD;
    v_key TEXT := 'friends_going:' || p_beacon;
    v_title TEXT;
BEGIN
    SELECT b.id, b.creator_id, b.metadata, b.visibility_audience::text AS audience INTO e
    FROM public.map_beacons b
    WHERE b.id = p_beacon
      AND b.beacon_type::text = 'event'
      AND b.event_visibility = 'public'
      AND b.guest_list_visibility = 'public'
      AND NOT b.flagged
      AND b.cleared_at IS NULL
      AND coalesce(b.ends_at, b.starts_at + INTERVAL '3 hours', b.expires_at) > now();
    IF NOT FOUND OR p_attendee = e.creator_id
       OR EXISTS (SELECT 1 FROM public.users WHERE id = p_attendee AND coalesce(ghost_mode, false)) THEN
        RETURN;
    END IF;

    FOR r IN
        SELECT v.viewer, f.friend, f.total
        FROM public.activity_connection_ids(p_attendee) AS v(viewer)
        LEFT JOIN LATERAL (
            SELECT a.user_id AS friend, count(*) OVER () AS total
            FROM public.beacon_attendees a
            JOIN public.users u ON u.id = a.user_id
            WHERE a.beacon_id = e.id
              AND a.user_id <> e.creator_id
              AND NOT coalesce(u.ghost_mode, false)
              AND a.user_id IN (SELECT public.activity_connection_ids(v.viewer))
              AND NOT public.activity_blocked(v.viewer, a.user_id)
            ORDER BY a.created_at DESC
            LIMIT 1
        ) f ON true
        WHERE v.viewer <> e.creator_id
          AND EXISTS (SELECT 1 FROM public.users WHERE id = v.viewer)
          AND NOT EXISTS (SELECT 1 FROM public.beacon_attendees a WHERE a.beacon_id = e.id AND a.user_id = v.viewer)
          AND NOT public.activity_blocked(v.viewer, e.creator_id)
          AND (e.audience IS DISTINCT FROM 'connections' OR e.creator_id IN (SELECT public.activity_connection_ids(v.viewer)))
    LOOP
        IF r.friend IS NULL THEN
            DELETE FROM public.activity_items WHERE user_id = r.viewer AND group_key = v_key;
            CONTINUE;
        END IF;
        v_title := public.activity_first_name(r.friend) || CASE
            WHEN r.total = 1 THEN ' is going'
            WHEN r.total = 2 THEN ' and 1 other you know are going'
            ELSE ' and ' || (r.total - 1) || ' others you know are going' END;
        IF p_bump THEN
            PERFORM public.record_activity(r.viewer, 'friends_going', v_title, public.activity_event_title(e.metadata),
                                           jsonb_build_object('type', 'friends_going', 'beacon_id', e.id::text),
                                           r.friend, v_key);
        ELSE
            UPDATE public.activity_items SET title = v_title, actor_id = r.friend
            WHERE user_id = r.viewer AND group_key = v_key;
        END IF;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_friends_going()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    BEGIN
        IF TG_OP = 'INSERT' THEN
            PERFORM public.refresh_friends_going(NEW.beacon_id, NEW.user_id, true);
        ELSE
            PERFORM public.refresh_friends_going(OLD.beacon_id, OLD.user_id, false);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'friends going activity: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_friends_going ON public.beacon_attendees;
CREATE TRIGGER trg_friends_going
    AFTER INSERT OR DELETE ON public.beacon_attendees
    FOR EACH ROW EXECUTE FUNCTION public.trg_friends_going();

-- Trending near you ------------------------------------------------------------------------

-- Run hourly (cron-hourly-maintenance). An upcoming public event is "hot" with 8+ going and
-- still gaining, or "picking up" when 3+ joined in the last day and they're at least half its
-- crowd. Each person hears about at most one a day, never the same event twice, and only
-- within 40 km of where they've hosted or joined something in the last 120 days (no location
-- history, no suggestions: a far-away event isn't a recommendation).
CREATE OR REPLACE FUNCTION public.record_trending_event_activity()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH events AS (
        SELECT b.id, b.creator_id, b.location, b.metadata,
               count(*) AS going,
               count(*) FILTER (WHERE a.created_at > now() - INTERVAL '24 hours') AS recent
        FROM public.map_beacons b
        JOIN public.beacon_attendees a ON a.beacon_id = b.id AND a.user_id <> b.creator_id
        WHERE b.beacon_type::text = 'event'
          AND b.event_visibility = 'public'
          AND b.visibility_audience::text = 'everyone'
          AND NOT b.flagged
          AND b.cleared_at IS NULL
          AND b.location IS NOT NULL
          AND b.starts_at BETWEEN now() - INTERVAL '1 hour' AND now() + INTERVAL '7 days'
          AND coalesce(b.ends_at, b.starts_at + INTERVAL '3 hours') > now()
        GROUP BY b.id
    ), trending AS (
        SELECT e.*, CASE WHEN e.going >= 8 THEN 'hot' ELSE 'rising' END AS trend
        FROM events e
        WHERE (e.going >= 8 AND e.recent >= 2) OR (e.recent >= 3 AND e.recent * 2 >= e.going)
    ), anchors AS (
        SELECT DISTINCT x.user_id, b.location
        FROM (
            SELECT creator_id AS user_id, id AS beacon_id FROM public.map_beacons
            WHERE created_at > now() - INTERVAL '120 days'
            UNION
            SELECT user_id, beacon_id FROM public.beacon_attendees
            WHERE created_at > now() - INTERVAL '120 days'
        ) x
        JOIN public.map_beacons b ON b.id = x.beacon_id
        WHERE b.location IS NOT NULL
    ), picks AS (
        SELECT DISTINCT ON (an.user_id) an.user_id, t.id, t.metadata, t.going, t.recent, t.trend
        FROM trending t
        JOIN anchors an ON ST_DWithin(an.location, t.location, 40000)
        WHERE an.user_id <> t.creator_id
          AND NOT EXISTS (SELECT 1 FROM public.beacon_attendees a WHERE a.beacon_id = t.id AND a.user_id = an.user_id)
          AND NOT EXISTS (
              SELECT 1 FROM public.activity_items i
              WHERE i.user_id = an.user_id
                AND (i.group_key IN ('trending:' || t.id, 'friends_going:' || t.id)
                     OR (i.type = 'event_trending' AND i.created_at > now() - INTERVAL '20 hours'))
          )
          AND NOT public.activity_blocked(an.user_id, t.creator_id)
        ORDER BY an.user_id, t.recent DESC, t.going DESC
    )
    INSERT INTO public.activity_items (user_id, type, title, body, data, group_key)
    SELECT p.user_id, 'event_trending',
           left(public.activity_event_title(p.metadata)
                || CASE p.trend WHEN 'hot' THEN ' is popular near you' ELSE ' is picking up near you' END, 200),
           p.going || ' going · ' || p.recent || ' joined in the last day',
           jsonb_build_object('type', 'event_trending', 'beacon_id', p.id::text, 'trend', p.trend),
           'trending:' || p.id
    FROM picks p
    WHERE EXISTS (SELECT 1 FROM public.users WHERE id = p.user_id)
    ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.activity_first_name(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_connection_ids(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activity_blocked(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_connection_activity(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_friends_going(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_trending_event_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_connection_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_friends_going() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trending_event_activity() TO service_role;

-- Backfill ---------------------------------------------------------------------------------

-- Clicks from the last 90 days, dated when they happened.
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
  AND coalesce(c.created_utc, to_timestamp(c.created / 1000.0)) > now() - INTERVAL '90 days'
  AND EXISTS (SELECT 1 FROM public.users WHERE id::text = me)
  AND EXISTS (SELECT 1 FROM public.users WHERE id::text = p.peer)
ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL DO NOTHING;

-- People you know going to events that haven't ended: replay each RSVP in order (the function
-- skips past events), then date each row at the RSVP it names instead of now.
DO $$
DECLARE
    a RECORD;
BEGIN
    FOR a IN SELECT beacon_id, user_id FROM public.beacon_attendees ORDER BY created_at LOOP
        PERFORM public.refresh_friends_going(a.beacon_id, a.user_id, true);
    END LOOP;
END;
$$;

UPDATE public.activity_items i
SET created_at = a.created_at
FROM public.beacon_attendees a
WHERE i.type = 'friends_going'
  AND a.beacon_id::text = i.data ->> 'beacon_id'
  AND a.user_id = i.actor_id;
