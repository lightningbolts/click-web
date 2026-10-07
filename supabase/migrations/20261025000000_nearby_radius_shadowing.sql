-- Nearby reads ignored the caller's radius. These SQL functions join (or read) `hub_venues`,
-- whose `radius_meters` column shadows the parameter of the same name: in a SQL function a
-- column wins over an argument. So `ST_DWithin(..., radius_meters)` used each row's hub
-- radius: a beacon without a hub (NULL) was never found, and an event with a hub only within
-- its check-in radius. Map, Nearby and the hub list showed only the viewer's own beacons and
-- whatever they stood on.
--
-- Arguments are now qualified with the function name (or positional where the result table
-- has a column of the same name), so no column can capture them. Signatures, grants and
-- results are otherwise unchanged.

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
              ST_SetSRID(ST_MakePoint(fetch_map_beacons_within_page.lng, fetch_map_beacons_within_page.lat), 4326)::geography,
              fetch_map_beacons_within_page.radius_meters
          )
          AND (
              fetch_map_beacons_within_page.p_before_created_at IS NULL
              OR (beacon.created_at, beacon.id) < (
                  fetch_map_beacons_within_page.p_before_created_at,
                  COALESCE(fetch_map_beacons_within_page.p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)
              )
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
        LIMIT GREATEST(1, LEAST(COALESCE(fetch_map_beacons_within_page.p_limit, 200), 500))
    ) AS visible_beacons;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_map_beacons_within(
    lat double precision,
    lng double precision,
    radius_meters double precision DEFAULT 5000,
    p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
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
            beacon.created_at
        FROM public.map_beacons AS beacon
        LEFT JOIN public.hub_venues AS hub ON hub.event_beacon_id = beacon.id
        WHERE beacon.expires_at > now()
          AND ST_DWithin(
              beacon.location,
              ST_SetSRID(ST_MakePoint(fetch_map_beacons_within.lng, fetch_map_beacons_within.lat), 4326)::geography,
              fetch_map_beacons_within.radius_meters
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
        ORDER BY beacon.created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(fetch_map_beacons_within.p_limit, 200), 500))
    ) AS visible_beacons;
$function$;

-- The result table has its own `radius_meters` (the hub's), so the arguments are positional:
-- $1 lat, $2 lng, $3 radius_meters, $4 p_limit.
CREATE OR REPLACE FUNCTION public.get_hubs_nearby(
    lat double precision,
    lng double precision,
    radius_meters double precision DEFAULT 15000,
    p_limit integer DEFAULT 50
)
RETURNS TABLE(id text, name text, category text, geofence_lat double precision, geofence_long double precision, radius_meters integer, expires_at timestamp with time zone, distance_meters double precision, participant_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    WITH nearby AS (
        SELECT
            h.id, h.name, h.category, h.geofence_lat, h.geofence_long, h.radius_meters, h.expires_at,
            ST_Distance(h.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_meters
        FROM public.hub_venues h
        WHERE (h.expires_at IS NULL OR h.expires_at > now())
          AND h.event_beacon_id IS NULL
          AND h.place_id IS NULL
          AND ST_DWithin(h.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
        ORDER BY distance_meters ASC
        LIMIT GREATEST(1, LEAST(COALESCE($4, 50), 100))
    )
    SELECT n.id, n.name, n.category, n.geofence_lat, n.geofence_long, n.radius_meters, n.expires_at,
           n.distance_meters, COALESCE(pc.cnt, 0::bigint) AS participant_count
    FROM nearby n
    LEFT JOIN (
        SELECT hub_id, COUNT(*)::bigint AS cnt FROM public.hub_participants GROUP BY hub_id
    ) pc ON pc.hub_id = n.id;
$function$;
