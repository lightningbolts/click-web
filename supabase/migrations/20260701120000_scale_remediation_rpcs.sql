-- Scale remediation: inbox RPC, availability overlap batch, capped beacons, hub nearby, indexes.

-- ─── 1. messages(chat_id, time_created DESC) for inbox + active chat tail ───
CREATE INDEX IF NOT EXISTS idx_messages_chat_time_created_desc
    ON public.messages (chat_id, time_created DESC);

-- ─── 2. Partial indexes for expire sweepers ───
CREATE INDEX IF NOT EXISTS idx_connections_pending_sweep
    ON public.connections (created)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_availability_intents_active
    ON public.availability_intents (user_id, expires_at);

-- ─── 3. Hub venues geography (for spatial nearby) ───
ALTER TABLE public.hub_venues
    ADD COLUMN IF NOT EXISTS location geography (Point, 4326)
    GENERATED ALWAYS AS (
        ST_SetSRID (ST_MakePoint (geofence_long, geofence_lat), 4326)::geography
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_hub_venues_location_gix
    ON public.hub_venues USING GIST (location);

-- ─── 4. Batch availability overlap ───
CREATE OR REPLACE FUNCTION public.get_availability_overlaps(p_peer_ids uuid[])
RETURNS TABLE (peer_id uuid, has_overlap boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH viewer_intents AS (
        SELECT lower(trim(intent_tag)) AS tag, lower(trim(timeframe)) AS tf
        FROM public.availability_intents
        WHERE user_id = auth.uid()
          AND expires_at > now()
    ),
    viewer_tags AS (
        SELECT tag FROM viewer_intents WHERE tag IS NOT NULL AND tag <> ''
    ),
    viewer_tfs AS (
        SELECT tf FROM viewer_intents WHERE tf IS NOT NULL AND tf <> ''
    ),
    eligible_peers AS (
        SELECT DISTINCT peer AS peer_id
        FROM unnest(p_peer_ids) AS peer
        WHERE peer IS NOT NULL
          AND peer <> auth.uid()
          AND EXISTS (
              SELECT 1
              FROM public.connections c
              WHERE auth.uid()::text = ANY (c.user_ids)
                AND peer::text = ANY (c.user_ids)
          )
    ),
    peer_intents AS (
        SELECT
            ep.peer_id,
            lower(trim(ai.intent_tag)) AS tag,
            lower(trim(ai.timeframe)) AS tf
        FROM eligible_peers ep
        INNER JOIN public.availability_intents ai
            ON ai.user_id = ep.peer_id
           AND ai.expires_at > now()
    ),
    overlap_flags AS (
        SELECT
            ep.peer_id,
            EXISTS (
                SELECT 1
                FROM peer_intents pi
                WHERE pi.peer_id = ep.peer_id
                  AND (
                      (pi.tag IS NOT NULL AND pi.tag <> '' AND pi.tag IN (SELECT tag FROM viewer_tags))
                      OR (pi.tf IS NOT NULL AND pi.tf <> '' AND pi.tf IN (SELECT tf FROM viewer_tfs))
                  )
            ) AS has_overlap
        FROM eligible_peers ep
    )
    SELECT peer_id, has_overlap FROM overlap_flags;
$$;

COMMENT ON FUNCTION public.get_availability_overlaps(uuid[]) IS
    'Returns overlap flags for auth.uid() vs each peer (mutual connection required).';

GRANT EXECUTE ON FUNCTION public.get_availability_overlaps(uuid[]) TO authenticated;

-- ─── 5. Inbox feed (paginated connections + previews + junction flags) ───
CREATE OR REPLACE FUNCTION public.get_inbox_feed(
    p_cursor_last_message_at bigint DEFAULT NULL,
    p_limit integer DEFAULT 50
)
RETURNS TABLE (
    connection_id uuid,
    chat_id uuid,
    group_id uuid,
    is_archived boolean,
    is_hidden boolean,
    is_core boolean,
    last_message_id uuid,
    last_message_user_id uuid,
    last_message_content text,
    last_message_time_created bigint,
    last_message_type text,
    last_message_metadata jsonb,
    last_message_is_read boolean,
    unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH uid AS (SELECT auth.uid() AS viewer_id),
    archived AS (
        SELECT ca.connection_id
        FROM public.connection_archives ca, uid
        WHERE ca.user_id = uid.viewer_id
    ),
    hidden AS (
        SELECT ch.connection_id
        FROM public.connection_hidden ch, uid
        WHERE ch.user_id = uid.viewer_id
    ),
    core AS (
        SELECT cc.connection_id
        FROM public.connection_core cc, uid
        WHERE cc.user_id = uid.viewer_id
    ),
    user_connections AS (
        SELECT c.id AS connection_id, c.last_message_at
        FROM public.connections c, uid
        WHERE uid.viewer_id::text = ANY (c.user_ids)
          AND c.id NOT IN (SELECT connection_id FROM hidden)
          AND c.id NOT IN (SELECT connection_id FROM archived)
          AND (
              p_cursor_last_message_at IS NULL
              OR COALESCE(c.last_message_at, c.created) < p_cursor_last_message_at
          )
        ORDER BY COALESCE(c.last_message_at, c.created) DESC NULLS LAST
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    ),
    user_chats AS (
        SELECT c.id AS chat_id, c.connection_id, c.group_id
        FROM public.chats c
        INNER JOIN user_connections uc ON uc.connection_id = c.connection_id
    ),
    group_chats AS (
        SELECT c.id AS chat_id, c.group_id
        FROM public.chats c
        INNER JOIN public.group_members gm ON gm.group_id = c.group_id
        CROSS JOIN uid
        WHERE gm.user_id = uid.viewer_id
          AND c.group_id IS NOT NULL
          AND c.connection_id IS NULL
    ),
    all_chats AS (
        SELECT chat_id, connection_id, group_id FROM user_chats
        UNION ALL
        SELECT chat_id, NULL::uuid, group_id FROM group_chats
    ),
    latest AS (
        SELECT DISTINCT ON (m.chat_id)
            m.chat_id,
            m.id AS last_message_id,
            m.user_id AS last_message_user_id,
            m.content AS last_message_content,
            m.time_created AS last_message_time_created,
            m.message_type AS last_message_type,
            m.metadata AS last_message_metadata,
            m.is_read AS last_message_is_read
        FROM public.messages m
        INNER JOIN all_chats ac ON ac.chat_id = m.chat_id
        ORDER BY m.chat_id, m.time_created DESC
    ),
    unread AS (
        SELECT m.chat_id, COUNT(*)::bigint AS unread_count
        FROM public.messages m
        INNER JOIN all_chats ac ON ac.chat_id = m.chat_id
        CROSS JOIN uid
        WHERE m.is_read = false
          AND m.user_id IS DISTINCT FROM uid.viewer_id
        GROUP BY m.chat_id
    )
    SELECT
        uc.connection_id,
        ac.chat_id,
        ac.group_id,
        (uc.connection_id IN (SELECT connection_id FROM archived)) AS is_archived,
        false AS is_hidden,
        (uc.connection_id IN (SELECT connection_id FROM core)) AS is_core,
        l.last_message_id,
        l.last_message_user_id,
        l.last_message_content,
        l.last_message_time_created,
        l.last_message_type,
        l.last_message_metadata,
        COALESCE(l.last_message_is_read, false),
        COALESCE(u.unread_count, 0::bigint)
    FROM user_connections uc
    INNER JOIN all_chats ac ON ac.connection_id = uc.connection_id
    LEFT JOIN latest l ON l.chat_id = ac.chat_id
    LEFT JOIN unread u ON u.chat_id = ac.chat_id

    UNION ALL

    SELECT
        NULL::uuid,
        gc.chat_id,
        gc.group_id,
        false,
        false,
        false,
        l.last_message_id,
        l.last_message_user_id,
        l.last_message_content,
        l.last_message_time_created,
        l.last_message_type,
        l.last_message_metadata,
        COALESCE(l.last_message_is_read, false),
        COALESCE(u.unread_count, 0::bigint)
    FROM group_chats gc
    LEFT JOIN latest l ON l.chat_id = gc.chat_id
    LEFT JOIN unread u ON u.chat_id = gc.chat_id;
$$;

COMMENT ON FUNCTION public.get_inbox_feed(bigint, integer) IS
    'Paginated inbox rows: connection + group chats with latest message preview and unread counts.';

GRANT EXECUTE ON FUNCTION public.get_inbox_feed(bigint, integer) TO authenticated;

-- ─── 6. Capped beacons + visibility in SQL ───
CREATE OR REPLACE FUNCTION public.auth_uid_beacon_can_see_creator(p_creator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        p_creator_id = auth.uid()
        OR EXISTS (
            SELECT 1
            FROM public.connections c
            WHERE auth.uid()::text = ANY (c.user_ids)
              AND p_creator_id::text = ANY (c.user_ids)
        );
$$;

CREATE OR REPLACE FUNCTION public.auth_uid_core_peer_of_creator(p_creator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.connection_core cc
        INNER JOIN public.connections c ON c.id = cc.connection_id
        WHERE cc.user_id = auth.uid()
          AND p_creator_id::text = ANY (c.user_ids)
          AND auth.uid()::text = ANY (c.user_ids)
    );
$$;

DROP FUNCTION IF EXISTS public.fetch_map_beacons_within (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.fetch_map_beacons_within (
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 5000,
    p_limit INTEGER DEFAULT 200
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        jsonb_agg(row_data ORDER BY created_at DESC),
        '[]'::jsonb
    )
    FROM (
        SELECT
            jsonb_build_object(
                'id', b.id,
                'creator_id', b.creator_id,
                'venue_id', b.venue_id,
                'beacon_type', b.beacon_type,
                'show_creator_name', b.show_creator_name,
                'visibility_audience', b.visibility_audience,
                'lng', ST_X (b.location::geometry),
                'lat', ST_Y (b.location::geometry),
                'metadata', b.metadata,
                'created_at', b.created_at,
                'expires_at', b.expires_at
            ) AS row_data,
            b.created_at
        FROM public.map_beacons b
        WHERE b.expires_at > now()
          AND ST_DWithin (
              b.location,
              ST_SetSRID (ST_MakePoint (lng, lat), 4326)::geography,
              radius_meters
          )
          AND (
              b.creator_id = auth.uid()
              OR b.visibility_audience = 'everyone'::public.beacon_visibility_audience
              OR (
                  b.visibility_audience = 'connections'::public.beacon_visibility_audience
                  AND public.auth_uid_beacon_can_see_creator(b.creator_id)
              )
              OR (
                  b.visibility_audience = 'core_connections'::public.beacon_visibility_audience
                  AND public.auth_uid_core_peer_of_creator(b.creator_id)
              )
          )
        ORDER BY b.created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
    ) sub;
$$;

REVOKE ALL ON FUNCTION public.fetch_map_beacons_within (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.fetch_map_beacons_within (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) IS
    'Beacons within radius; visibility enforced; capped at p_limit (max 500).';

-- Backward-compatible 3-arg overload
CREATE OR REPLACE FUNCTION public.fetch_map_beacons_within (
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.fetch_map_beacons_within(lat, lng, radius_meters, 200);
$$;

GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- ─── 7. Hub nearby (PostGIS + aggregated counts) ───
CREATE OR REPLACE FUNCTION public.get_hubs_nearby(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 15000,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id text,
    name text,
    category text,
    geofence_lat double precision,
    geofence_long double precision,
    radius_meters integer,
    expires_at timestamptz,
    distance_meters double precision,
    participant_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH nearby AS (
        SELECT
            h.id,
            h.name,
            h.category,
            h.geofence_lat,
            h.geofence_long,
            h.radius_meters,
            h.expires_at,
            ST_Distance(
                h.location,
                ST_SetSRID (ST_MakePoint (lng, lat), 4326)::geography
            ) AS distance_meters
        FROM public.hub_venues h
        WHERE (h.expires_at IS NULL OR h.expires_at > now())
          AND ST_DWithin (
              h.location,
              ST_SetSRID (ST_MakePoint (lng, lat), 4326)::geography,
              radius_meters
          )
        ORDER BY distance_meters ASC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    )
    SELECT
        n.id,
        n.name,
        n.category,
        n.geofence_lat,
        n.geofence_long,
        n.radius_meters,
        n.expires_at,
        n.distance_meters,
        COALESCE(pc.cnt, 0::bigint) AS participant_count
    FROM nearby n
    LEFT JOIN (
        SELECT hub_id, COUNT(*)::bigint AS cnt
        FROM public.hub_participants
        GROUP BY hub_id
    ) pc ON pc.hub_id = n.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) TO service_role;
