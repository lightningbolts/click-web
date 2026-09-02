-- First-class map_beacons.hub_id (text → hub_venues.id, ON DELETE SET NULL).
-- 20260831000000 only added the reverse pointer hub_venues.event_beacon_id.
-- Safe to re-run.

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS hub_id text REFERENCES public.hub_venues (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS map_beacons_hub_id_idx
    ON public.map_beacons (hub_id);

COMMENT ON COLUMN public.map_beacons.hub_id IS
    'Auto-created event hub id. Distinct from venue_id (B2B venues). Cleared when the hub is deleted.';

UPDATE public.map_beacons b
SET hub_id = hv.id
FROM public.hub_venues hv
WHERE hv.event_beacon_id = b.id
  AND b.hub_id IS NULL;

UPDATE public.map_beacons b
SET hub_id = b.metadata->>'hub_id'
WHERE b.hub_id IS NULL
  AND NULLIF(btrim(b.metadata->>'hub_id'), '') IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM public.hub_venues hv
      WHERE hv.id = b.metadata->>'hub_id'
  );

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
                'hub_id', COALESCE(b.hub_id, hv.id),
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
                'hub_id', COALESCE(b.hub_id, hv.id),
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
