-- Live updates: Home, Map, Nearby and Clicks refresh the moment something they show changes,
-- instead of on the next relaunch.
--
-- Each signed-in client joins one private Realtime broadcast topic, `user:<their id>`, plus the
-- shared `beacons` topic. Statement-level triggers send a tiny hint there ({"kind": ...}, never
-- content): the client refetches through the same API routes, which resolve every audience
-- server-side, so a hint that reaches someone who can't see the change only costs one read.
-- Statement-level triggers with transition tables keep bulk writes (sweeps, backfills) to one
-- hint per person per statement.

-- ---------------------------------------------------------------------------
-- 1. Who may join which topic (private channels are authorized by RLS on realtime.messages)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS live_updates_own_topic_select ON realtime.messages;
CREATE POLICY live_updates_own_topic_select ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        extension = 'broadcast'
        AND realtime.topic() = 'user:' || (SELECT auth.uid())::text
    );

DROP POLICY IF EXISTS live_updates_beacons_topic_select ON realtime.messages;
CREATE POLICY live_updates_beacons_topic_select ON realtime.messages
    FOR SELECT TO authenticated
    USING (extension = 'broadcast' AND realtime.topic() = 'beacons');

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Everyone a user's audience-scoped content may reach: their connections (minus ones they hid and
-- anyone blocked either way), or only the ones they marked core. Hints only: reads still decide.
CREATE OR REPLACE FUNCTION public.live_peers(p_user uuid, p_core_only boolean DEFAULT false)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce(array_agg(DISTINCT peer.id), '{}')
    FROM public.connections c
    CROSS JOIN LATERAL unnest(c.user_ids) AS u(raw)
    CROSS JOIN LATERAL (
        SELECT CASE WHEN u.raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    THEN u.raw::uuid END AS id
    ) AS peer
    WHERE p_user IS NOT NULL
      AND c.user_ids @> ARRAY[p_user::text]
      AND peer.id IS NOT NULL
      AND peer.id <> p_user
      AND NOT EXISTS (
          SELECT 1 FROM public.connection_hidden h WHERE h.user_id = p_user AND h.connection_id = c.id
      )
      AND (NOT p_core_only OR EXISTS (
          SELECT 1 FROM public.connection_core k WHERE k.user_id = p_user AND k.connection_id = c.id
      ))
      AND NOT EXISTS (
          SELECT 1 FROM public.user_blocks b
          WHERE (b.blocker_id = p_user AND b.blocked_id = peer.id)
             OR (b.blocker_id = peer.id AND b.blocked_id = p_user)
      );
$$;

-- Sends one hint to each user's private topic. Never fails the write that triggered it.
CREATE OR REPLACE FUNCTION public.live_notify(p_user_ids uuid[], p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user uuid;
BEGIN
    FOR v_user IN SELECT DISTINCT x FROM unnest(p_user_ids) AS x WHERE x IS NOT NULL LOOP
        PERFORM realtime.send(p_payload, 'changed', 'user:' || v_user::text, true);
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'live_notify: %', SQLERRM;
END;
$$;

-- A user and their audience (as above) get the same hint.
CREATE OR REPLACE FUNCTION public.live_notify_audience(p_user uuid, p_core_only boolean, p_payload jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.live_notify(array_append(public.live_peers(p_user, p_core_only), p_user), p_payload);
$$;

REVOKE ALL ON FUNCTION public.live_peers(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.live_notify(uuid[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.live_notify_audience(uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Shared Click Drops → the poster and their audience refresh the Home strip
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.live_shared_drops_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r record;
BEGIN
    IF TG_OP = 'INSERT' THEN
        FOR r IN SELECT DISTINCT user_id, audience FROM new_rows LOOP
            PERFORM public.live_notify_audience(r.user_id, r.audience = 'core', '{"kind":"drops"}');
        END LOOP;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Old and new audience both hear about it (a drop narrowed to core leaves the others' strip).
        FOR r IN
            SELECT DISTINCT n.user_id, (n.audience = 'core' AND o.audience = 'core') AS core_only
            FROM new_rows n JOIN old_rows o ON o.id = n.id
            WHERE n.deleted_at IS DISTINCT FROM o.deleted_at
               OR n.reveal_at IS DISTINCT FROM o.reveal_at
               OR n.caption IS DISTINCT FROM o.caption
               OR n.audience IS DISTINCT FROM o.audience
        LOOP
            PERFORM public.live_notify_audience(r.user_id, r.core_only, '{"kind":"drops"}');
        END LOOP;
    ELSE
        FOR r IN SELECT DISTINCT user_id, audience FROM old_rows LOOP
            PERFORM public.live_notify_audience(r.user_id, r.audience = 'core', '{"kind":"drops"}');
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_shared_drops_insert ON public.shared_drops;
CREATE TRIGGER trg_live_shared_drops_insert AFTER INSERT ON public.shared_drops
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_shared_drops_changed();
DROP TRIGGER IF EXISTS trg_live_shared_drops_update ON public.shared_drops;
CREATE TRIGGER trg_live_shared_drops_update AFTER UPDATE ON public.shared_drops
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_shared_drops_changed();
DROP TRIGGER IF EXISTS trg_live_shared_drops_delete ON public.shared_drops;
CREATE TRIGGER trg_live_shared_drops_delete AFTER DELETE ON public.shared_drops
    REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_shared_drops_changed();

-- ---------------------------------------------------------------------------
-- 4. Map beacons → Map, Nearby and Home's nearby section
-- ---------------------------------------------------------------------------
-- Public beacons go to the shared `beacons` topic with a ~10 km cell (the map already shows them
-- exactly), so clients far away skip the refetch. Connection-only beacons go to the creator's
-- audience. Rows from both sides of an update are announced, so a beacon that moved or narrowed
-- its audience also leaves the maps that showed it.

-- Updates compare whole rows: any field the map shows may change (time, place, cover, attendees).
-- Rows that produce the same hint (same audience and cell) are sent once.
CREATE OR REPLACE FUNCTION public.live_map_beacons_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sides public.map_beacons[];
    r record;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT array_agg(n) INTO v_sides FROM new_rows n;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT array_agg(v.side) INTO v_sides
        FROM new_rows n
        JOIN old_rows o ON o.id = n.id
        CROSS JOIN LATERAL (VALUES (n), (o)) AS v(side)
        WHERE to_jsonb(n) IS DISTINCT FROM to_jsonb(o);
    ELSE
        SELECT array_agg(o) INTO v_sides FROM old_rows o;
    END IF;

    FOR r IN
        SELECT DISTINCT
            CASE WHEN b.visibility_audience = 'everyone' THEN NULL ELSE b.creator_id END AS creator_id,
            b.visibility_audience::text AS audience,
            jsonb_strip_nulls(jsonb_build_object(
                'kind', 'beacons',
                'lat', round(ST_Y(b.location::geometry)::numeric, 1),
                'lng', round(ST_X(b.location::geometry)::numeric, 1)
            )) AS payload
        FROM unnest(v_sides) AS b
    LOOP
        IF r.audience = 'everyone' THEN
            BEGIN
                PERFORM realtime.send(r.payload, 'changed', 'beacons', true);
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'live_map_beacons_changed: %', SQLERRM;
            END;
        ELSE
            PERFORM public.live_notify_audience(r.creator_id, r.audience = 'core_connections', r.payload);
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_map_beacons_insert ON public.map_beacons;
CREATE TRIGGER trg_live_map_beacons_insert AFTER INSERT ON public.map_beacons
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_map_beacons_changed();
DROP TRIGGER IF EXISTS trg_live_map_beacons_update ON public.map_beacons;
CREATE TRIGGER trg_live_map_beacons_update AFTER UPDATE ON public.map_beacons
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_map_beacons_changed();
DROP TRIGGER IF EXISTS trg_live_map_beacons_delete ON public.map_beacons;
CREATE TRIGGER trg_live_map_beacons_delete AFTER DELETE ON public.map_beacons
    REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_map_beacons_changed();

-- ---------------------------------------------------------------------------
-- 5. Per-user rows: nudges (Home's opportunity card) and the activity inbox (Home's bell)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.live_own_rows_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.live_notify(
        (SELECT array_agg(DISTINCT user_id) FROM new_rows),
        jsonb_build_object('kind', TG_ARGV[0])
    );
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_nudges_insert ON public.nudges;
CREATE TRIGGER trg_live_nudges_insert AFTER INSERT ON public.nudges
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_own_rows_inserted('nudges');
DROP TRIGGER IF EXISTS trg_live_activity_items_insert ON public.activity_items;
CREATE TRIGGER trg_live_activity_items_insert AFTER INSERT ON public.activity_items
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_own_rows_inserted('activity');

-- ---------------------------------------------------------------------------
-- 6. Availability ("I'm down for…") → the owner and their connections (Home's overlap row)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.live_availability_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        FOR v_user IN SELECT DISTINCT user_id FROM old_rows LOOP
            PERFORM public.live_notify_audience(v_user, false, '{"kind":"availability"}');
        END LOOP;
    ELSE
        FOR v_user IN SELECT DISTINCT user_id FROM new_rows LOOP
            PERFORM public.live_notify_audience(v_user, false, '{"kind":"availability"}');
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_availability_insert ON public.availability_intents;
CREATE TRIGGER trg_live_availability_insert AFTER INSERT ON public.availability_intents
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_availability_changed();
DROP TRIGGER IF EXISTS trg_live_availability_update ON public.availability_intents;
CREATE TRIGGER trg_live_availability_update AFTER UPDATE ON public.availability_intents
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_availability_changed();
DROP TRIGGER IF EXISTS trg_live_availability_delete ON public.availability_intents;
CREATE TRIGGER trg_live_availability_delete AFTER DELETE ON public.availability_intents
    REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_availability_changed();

-- ---------------------------------------------------------------------------
-- 7. Connections → both people's Clicks list (and Home's people, Map's friend pins)
-- ---------------------------------------------------------------------------
-- Only membership and lifecycle changes: `last_message_at` moves on every message, which the
-- inbox's own message stream already covers.

CREATE OR REPLACE FUNCTION public.live_connections_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_users uuid[];
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT array_agg(DISTINCT u::uuid) INTO v_users
        FROM new_rows, unnest(user_ids) AS u
        WHERE u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT array_agg(DISTINCT u::uuid) INTO v_users
        FROM new_rows n
        JOIN old_rows o ON o.id = n.id
        CROSS JOIN LATERAL unnest(n.user_ids || o.user_ids) AS u
        WHERE (n.status IS DISTINCT FROM o.status
               OR n.expiry_state IS DISTINCT FROM o.expiry_state
               OR n.user_ids IS DISTINCT FROM o.user_ids)
          AND u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    ELSE
        SELECT array_agg(DISTINCT u::uuid) INTO v_users
        FROM old_rows, unnest(user_ids) AS u
        WHERE u ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    END IF;
    PERFORM public.live_notify(v_users, '{"kind":"connections"}');
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_connections_insert ON public.connections;
CREATE TRIGGER trg_live_connections_insert AFTER INSERT ON public.connections
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_connections_changed();
DROP TRIGGER IF EXISTS trg_live_connections_update ON public.connections;
CREATE TRIGGER trg_live_connections_update AFTER UPDATE ON public.connections
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_connections_changed();
DROP TRIGGER IF EXISTS trg_live_connections_delete ON public.connections;
CREATE TRIGGER trg_live_connections_delete AFTER DELETE ON public.connections
    REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_connections_changed();

-- Trigger functions run as their owner; nobody calls them directly.
REVOKE ALL ON FUNCTION public.live_shared_drops_changed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.live_map_beacons_changed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.live_own_rows_inserted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.live_availability_changed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.live_connections_changed() FROM PUBLIC, anon, authenticated;
