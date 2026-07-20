-- PostgREST returns HTTP 300 when both the 3-arg and 4-arg overloads match a call
-- with only {lat, lng, radius_meters} (4-arg p_limit has a DEFAULT). That silently
-- emptied GET /api/beacons for every client — events still appeared via bookmark seeds.
-- Keep ONLY the 4-arg function; callers must pass p_limit explicitly.

DROP FUNCTION IF EXISTS public.fetch_map_beacons_within (
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION
);

-- Re-affirm the 4-arg function + grants (idempotent).
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

REVOKE ALL ON FUNCTION public.fetch_map_beacons_within (
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    INTEGER
) FROM PUBLIC;
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

COMMENT ON FUNCTION public.fetch_map_beacons_within (
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    INTEGER
) IS
    'Beacons within radius; visibility enforced; single overload so PostgREST does not 300.';
