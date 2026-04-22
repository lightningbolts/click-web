-- Map beacons: local soundtracks + community signals (PostGIS), RLS, proximity fetch RPC,
-- and hub chat broadcast when recreation/hobby beacons land near an active ephemeral hub.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 1. Enum + table
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'map_beacon_type'
    ) THEN
        CREATE TYPE public.map_beacon_type AS ENUM (
            'soundtrack',
            'hazard_utility',
            'swag',
            'capacity',
            'recreation',
            'transit',
            'sos',
            'study',
            'hobby',
            'scavenger'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.map_beacons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    creator_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    venue_id UUID REFERENCES public.venues (id) ON DELETE SET NULL,
    beacon_type public.map_beacon_type NOT NULL,
    location geography (Point, 4326) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    CONSTRAINT map_beacons_metadata_object CHECK (jsonb_typeof (metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_map_beacons_expires_at ON public.map_beacons (expires_at);

CREATE INDEX IF NOT EXISTS idx_map_beacons_location_gix ON public.map_beacons USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_map_beacons_creator ON public.map_beacons (creator_id);

CREATE INDEX IF NOT EXISTS idx_map_beacons_venue ON public.map_beacons (venue_id)
WHERE
    venue_id IS NOT NULL;

COMMENT ON TABLE public.map_beacons IS
    'Geospatial beacons: soundtracks (7-day default), community signals, and venue-official pins.';

-- Default expiry: 7 days for soundtracks; other types keep explicit client/server expiry.
CREATE OR REPLACE FUNCTION public.map_beacons_set_default_expiry ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.beacon_type = 'soundtrack'::public.map_beacon_type THEN
        IF NEW.expires_at IS NULL OR NEW.expires_at = NEW.created_at THEN
            NEW.expires_at := NEW.created_at + interval '7 days';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_map_beacons_default_expiry ON public.map_beacons;

CREATE TRIGGER trg_map_beacons_default_expiry
    BEFORE INSERT ON public.map_beacons
    FOR EACH ROW
    EXECUTE FUNCTION public.map_beacons_set_default_expiry ();

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.map_beacons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "map_beacons_select_active" ON public.map_beacons;

DROP POLICY IF EXISTS "map_beacons_select_scoped" ON public.map_beacons;

CREATE POLICY "map_beacons_select_scoped"
    ON public.map_beacons
    FOR SELECT
    USING (
        expires_at > now()
        AND (
            creator_id = auth.uid ()
            OR (
                venue_id IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM public.venue_managers vm
                    WHERE
                        vm.venue_id = map_beacons.venue_id
                        AND vm.user_id = auth.uid ()
                )
            )
        )
    );

DROP POLICY IF EXISTS "map_beacons_insert_authenticated" ON public.map_beacons;

CREATE POLICY "map_beacons_insert_authenticated"
    ON public.map_beacons
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid () = creator_id);

DROP POLICY IF EXISTS "map_beacons_delete_own" ON public.map_beacons;

CREATE POLICY "map_beacons_delete_own"
    ON public.map_beacons
    FOR DELETE
    TO authenticated
    USING (auth.uid () = creator_id);

GRANT SELECT, INSERT, DELETE ON public.map_beacons TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER: insert system hub message (bypasses hub_messages user_id check)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._insert_hub_system_message (
    p_hub_id TEXT,
    p_actor_user_id UUID,
    p_body TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.hub_messages (
        hub_id,
        user_id,
        body,
        metadata,
        message_type
    )
    VALUES (
        p_hub_id,
        p_actor_user_id,
        p_body,
        COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('is_system', true),
        'text'
    );
END;
$$;

REVOKE ALL ON FUNCTION public._insert_hub_system_message (TEXT, UUID, TEXT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public._insert_hub_system_message (TEXT, UUID, TEXT, JSONB) TO postgres;

COMMENT ON FUNCTION public._insert_hub_system_message (TEXT, UUID, TEXT, JSONB) IS
    'Internal: post a system line to hub chat; p_actor_user_id satisfies hub_messages.user_id FK.';

-- ---------------------------------------------------------------------------
-- 4. Trigger: recreation/hobby near active hub → system message
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.map_beacons_broadcast_near_hub ()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    hub RECORD;

    v_lat DOUBLE PRECISION;

    v_lng DOUBLE PRECISION;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RETURN NEW;
    END IF;

    IF NEW.beacon_type NOT IN ('recreation'::public.map_beacon_type, 'hobby'::public.map_beacon_type) THEN
        RETURN NEW;
    END IF;

    IF NEW.expires_at <= now() THEN
        RETURN NEW;
    END IF;

    v_lat := ST_Y (NEW.location::geometry);

    v_lng := ST_X (NEW.location::geometry);

    FOR hub IN
        SELECT
            hv.id,
            hv.name,
            hv.radius_meters
        FROM public.hub_venues hv
        WHERE
            ST_DWithin (
                NEW.location,
                ST_SetSRID (ST_MakePoint (hv.geofence_long, hv.geofence_lat), 4326)::geography,
                hv.radius_meters
            )
    LOOP
        PERFORM public._insert_hub_system_message (
            hub.id,
            NEW.creator_id,
            format(
                'A nearby %s beacon was shared in the community map.',
                NEW.beacon_type
            ),
            jsonb_build_object(
                'beacon_id',
                NEW.id,
                'beacon_type',
                NEW.beacon_type::text,
                'hub_id',
                hub.id
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_map_beacons_broadcast_near_hub ON public.map_beacons;

CREATE TRIGGER trg_map_beacons_broadcast_near_hub
    AFTER INSERT ON public.map_beacons
    FOR EACH ROW
    EXECUTE FUNCTION public.map_beacons_broadcast_near_hub ();

-- ---------------------------------------------------------------------------
-- 5. RPC: beacons within radius (meters) of a point — used by Edge + optional server
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fetch_map_beacons_within (
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 5000
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id',
                    b.id,
                    'creator_id',
                    b.creator_id,
                    'venue_id',
                    b.venue_id,
                    'beacon_type',
                    b.beacon_type,
                    'lng',
                    ST_X (b.location::geometry),
                    'lat',
                    ST_Y (b.location::geometry),
                    'metadata',
                    b.metadata,
                    'created_at',
                    b.created_at,
                    'expires_at',
                    b.expires_at
                )
                ORDER BY
                    b.created_at DESC
            ),
            '[]'::jsonb
        )
    FROM public.map_beacons b
    WHERE
        b.expires_at > now()
        AND ST_DWithin (
            b.location,
            ST_SetSRID (ST_MakePoint (lng, lat), 4326)::geography,
            radius_meters
        );
$$;

REVOKE ALL ON FUNCTION public.fetch_map_beacons_within (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

COMMENT ON FUNCTION public.fetch_map_beacons_within (DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) IS
    'Active map_beacons within radius_m of (lat,lng); SECURITY DEFINER proximity read for authenticated map clients.';

-- ---------------------------------------------------------------------------
-- 8. Venue manager list (typed JSON — avoids broad table SELECT for map UI)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_venue_map_beacons_list (venue_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    RETURN COALESCE(
        (
            SELECT
                jsonb_agg(
                    jsonb_build_object(
                        'id',
                        b.id,
                        'creator_id',
                        b.creator_id,
                        'venue_id',
                        b.venue_id,
                        'beacon_type',
                        b.beacon_type,
                        'lng',
                        ST_X (b.location::geometry),
                        'lat',
                        ST_Y (b.location::geometry),
                        'metadata',
                        b.metadata,
                        'created_at',
                        b.created_at,
                        'expires_at',
                        b.expires_at
                    )
                    ORDER BY
                        b.created_at DESC
                )
            FROM public.map_beacons b
            WHERE
                b.venue_id = venue_id_param
                AND b.expires_at > now ()
        ),
        '[]'::jsonb
    );
END;
$$;

REVOKE ALL ON FUNCTION public.insights_venue_map_beacons_list (UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insights_venue_map_beacons_list (UUID) TO authenticated;

COMMENT ON FUNCTION public.insights_venue_map_beacons_list (UUID) IS
    'Active map_beacons for a venue; venue managers only.';

-- ---------------------------------------------------------------------------
-- 6. Verified venue flag (ops / migration seed for official broadcasting)
-- ---------------------------------------------------------------------------

ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.venues.is_verified IS
    'When true, venue managers may post official soundtrack beacons at venue coordinates.';

-- ---------------------------------------------------------------------------
-- 7. Manager RPC: beacon density by type within Vibe Radar cell radius (~0.1 mi)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_vibe_radar_beacon_density (venue_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lat DOUBLE PRECISION;

    v_lng DOUBLE PRECISION;

    radius_m CONSTANT DOUBLE PRECISION := 160.934;

    rows JSONB;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    SELECT v.latitude, v.longitude
    INTO v_lat, v_lng
    FROM public.venues v
    WHERE v.id = venue_id_param;

    IF v_lat IS NULL OR v_lng IS NULL THEN
        RETURN jsonb_build_object(
            'trending',
            '[]'::jsonb,
            'venueCenter',
            jsonb_build_object('lat', NULL, 'lng', NULL),
            'radiusMeters',
            radius_m,
            'status',
            'venue_coordinates_required'
        );
    END IF;

    WITH typed AS (
        SELECT
            b.beacon_type::text AS beacon_type,
            COUNT(*)::bigint AS cnt
        FROM public.map_beacons b
        WHERE
            b.expires_at > now()
            AND ST_DWithin (
                b.location,
                ST_SetSRID (ST_MakePoint (v_lng, v_lat), 4326)::geography,
                radius_m
            )
        GROUP BY
            b.beacon_type
    )
    SELECT
        COALESCE(
            (
                SELECT
                    jsonb_agg(
                        jsonb_build_object(
                            'beacon_type',
                            t.beacon_type,
                            'count',
                            t.cnt
                        )
                        ORDER BY
                            t.cnt DESC
                    )
                FROM typed t
            ),
            '[]'::jsonb
        )
    INTO rows;

    RETURN jsonb_build_object(
        'trending',
        rows,
        'venueCenter',
        jsonb_build_object('lat', v_lat, 'lng', v_lng),
        'radiusMeters',
        radius_m,
        'status',
        'ok'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.insights_vibe_radar_beacon_density (UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insights_vibe_radar_beacon_density (UUID) TO authenticated;

COMMENT ON FUNCTION public.insights_vibe_radar_beacon_density (UUID) IS
    'Counts active map_beacons by type within ~0.1 mi of venue; managers only.';
