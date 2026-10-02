-- Keyset-paginated nearby beacons. Same visibility rules as fetch_map_beacons_within, ordered
-- newest first by (created_at, id); pass the last row's created_at and id to get the next page.
-- The unpaginated function is left as is for existing callers.

CREATE OR REPLACE FUNCTION public.fetch_map_beacons_within_page(
    lat double precision,
    lng double precision,
    radius_meters double precision DEFAULT 5000,
    p_limit integer DEFAULT 200,
    p_before_created_at timestamptz DEFAULT NULL,
    p_before_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC, id DESC), '[]'::jsonb)
    FROM (
        SELECT
            jsonb_build_object(
                'id', beacon.id,
                'creator_id', beacon.creator_id,
                'venue_id', beacon.venue_id,
                'hub_id', hub.id,
                'beacon_type', beacon.beacon_type,
                'show_creator_name', beacon.show_creator_name,
                'visibility_audience', beacon.visibility_audience,
                'lng', ST_X(beacon.location::geometry),
                'lat', ST_Y(beacon.location::geometry),
                'metadata', beacon.metadata,
                'created_at', beacon.created_at,
                'expires_at', beacon.expires_at
            ) AS row_data,
            beacon.created_at,
            beacon.id
        FROM public.map_beacons AS beacon
        LEFT JOIN public.hub_venues AS hub ON hub.event_beacon_id = beacon.id
        WHERE beacon.expires_at > now()
          AND ST_DWithin(
              beacon.location,
              ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
              radius_meters
          )
          AND (
              p_before_created_at IS NULL
              OR (beacon.created_at, beacon.id) < (p_before_created_at, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
          )
          AND (
              beacon.creator_id = auth.uid()
              OR beacon.visibility_audience = 'everyone'::public.beacon_visibility_audience
              OR (
                  beacon.visibility_audience = 'connections'::public.beacon_visibility_audience
                  AND public.auth_uid_beacon_can_see_creator(beacon.creator_id)
              )
              OR (
                  beacon.visibility_audience = 'core_connections'::public.beacon_visibility_audience
                  AND public.auth_uid_core_peer_of_creator(beacon.creator_id)
              )
          )
        ORDER BY beacon.created_at DESC, beacon.id DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
    ) AS visible_beacons;
$function$;

REVOKE ALL ON FUNCTION public.fetch_map_beacons_within_page(double precision, double precision, double precision, integer, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within_page(double precision, double precision, double precision, integer, timestamptz, uuid) TO authenticated, service_role;
