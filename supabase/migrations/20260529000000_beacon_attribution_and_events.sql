-- Beacon creator attribution + Event/Activity category + RSVP attendees.

-- 1. Creator name visibility flag
ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS show_creator_name BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.map_beacons.show_creator_name IS
    'When true, clients may display the creator display name on the beacon pin / detail sheet.';

-- 2. Extend enum with event / activity category
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'map_beacon_type'
          AND e.enumlabel = 'event'
    ) THEN
        ALTER TYPE public.map_beacon_type ADD VALUE 'event';
    END IF;
END $$;

-- 3. RSVP junction table
CREATE TABLE IF NOT EXISTS public.beacon_attendees (
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (beacon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_beacon_attendees_beacon ON public.beacon_attendees (beacon_id);

CREATE INDEX IF NOT EXISTS idx_beacon_attendees_user ON public.beacon_attendees (user_id);

ALTER TABLE public.beacon_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beacon_attendees_select_authenticated" ON public.beacon_attendees;

CREATE POLICY "beacon_attendees_select_authenticated"
    ON public.beacon_attendees
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "beacon_attendees_insert_own" ON public.beacon_attendees;

CREATE POLICY "beacon_attendees_insert_own"
    ON public.beacon_attendees
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid () = user_id);

DROP POLICY IF EXISTS "beacon_attendees_delete_own" ON public.beacon_attendees;

CREATE POLICY "beacon_attendees_delete_own"
    ON public.beacon_attendees
    FOR DELETE
    TO authenticated
    USING (auth.uid () = user_id);

GRANT SELECT, INSERT, DELETE ON public.beacon_attendees TO authenticated;

-- 4. Include show_creator_name in proximity RPC payload
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
