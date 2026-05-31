-- Per-beacon audience: who may see the pin on the map (enforced server-side on proximity fetch).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'beacon_visibility_audience'
    ) THEN
        CREATE TYPE public.beacon_visibility_audience AS ENUM (
            'everyone',
            'connections',
            'core_connections'
        );
    END IF;
END $$;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS visibility_audience public.beacon_visibility_audience NOT NULL DEFAULT 'everyone';

COMMENT ON COLUMN public.map_beacons.visibility_audience IS
    'Who can see this beacon on the map: everyone, any connection, or core connections only.';

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
                    'show_creator_name',
                    b.show_creator_name,
                    'visibility_audience',
                    b.visibility_audience,
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
