-- Link each user event beacon to an auto-created community hub.
-- Event hubs are excluded from nearby-hub discovery (the event pin is the surface).
-- Do not add map_beacons.hub_id — that column does not exist. The reverse
-- pointer is hub_venues.event_beacon_id; clients also read metadata.hub_id.

ALTER TABLE public.hub_venues
    ADD COLUMN IF NOT EXISTS event_beacon_id uuid UNIQUE REFERENCES public.map_beacons (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS hub_venues_event_beacon_id_idx
    ON public.hub_venues (event_beacon_id);

COMMENT ON COLUMN public.hub_venues.event_beacon_id IS
    'When set, this hub was created for a map event beacon. Access is check-in (or host), not geofence.';

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
          AND h.event_beacon_id IS NULL
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
                'hub_id', hv.id,
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
        LEFT JOIN public.hub_venues hv ON hv.event_beacon_id = b.id
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

GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within (
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    INTEGER
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within (
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    INTEGER
) TO service_role;

CREATE OR REPLACE FUNCTION public.fetch_creator_active_map_beacons (
    p_creator_id uuid,
    p_limit integer DEFAULT 50
)
RETURNS jsonb
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
                'hub_id', hv.id,
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
        LEFT JOIN public.hub_venues hv ON hv.event_beacon_id = b.id
        WHERE b.creator_id = p_creator_id
          AND b.expires_at > now()
        ORDER BY b.created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    ) sub;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons (uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons (uuid, integer) TO authenticated;
