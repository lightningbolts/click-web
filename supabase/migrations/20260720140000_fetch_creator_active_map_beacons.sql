-- Return a creator's active map beacons with lat/lng (avoids geography parse failures
-- when PostgREST returns opaque EWKB for the location column).

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
        WHERE b.creator_id = p_creator_id
          AND b.expires_at > now()
        ORDER BY b.created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    ) sub;
$$;

REVOKE ALL ON FUNCTION public.fetch_creator_active_map_beacons (uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons (uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons (uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.fetch_creator_active_map_beacons (uuid, integer) IS
    'Active map_beacons for a creator with lat/lng; used by GET /api/beacons own-pin merge.';
