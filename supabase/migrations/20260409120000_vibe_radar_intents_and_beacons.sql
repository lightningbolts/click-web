-- Vibe Radar: anonymized spatial intent aggregates for venue managers + Pop-Up Hub beacons.
-- Idempotent where possible.

-- ---------------------------------------------------------------------------
-- 1. Venue coordinates (map center + proximity radius anchor)
-- ---------------------------------------------------------------------------

ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE public.venues
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

COMMENT ON COLUMN public.venues.latitude IS
    'Optional WGS84 latitude for maps and proximity-based insights.';

COMMENT ON COLUMN public.venues.longitude IS
    'Optional WGS84 longitude for maps and proximity-based insights.';

-- ---------------------------------------------------------------------------
-- 2. Coarse spatial bucket on intents (no user PII in API; populated by clients when available)
-- ---------------------------------------------------------------------------

ALTER TABLE public.availability_intents
    ADD COLUMN IF NOT EXISTS anonymized_cell_id TEXT;

ALTER TABLE public.availability_intents
    ADD COLUMN IF NOT EXISTS cell_center_lat DOUBLE PRECISION;

ALTER TABLE public.availability_intents
    ADD COLUMN IF NOT EXISTS cell_center_lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_availability_intents_anon_cell
    ON public.availability_intents (anonymized_cell_id)
    WHERE anonymized_cell_id IS NOT NULL;

COMMENT ON COLUMN public.availability_intents.anonymized_cell_id IS
    'Opaque aggregate cell key (e.g. H3 index); never expose raw user coordinates to managers.';

-- ---------------------------------------------------------------------------
-- 3. Pop-Up Hub beacons (venue promotions targeting intent categories)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.venue_pop_up_hubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    perk_description TEXT NOT NULL,
    category_target TEXT NOT NULL,
    duration_minutes INT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT venue_pop_up_hubs_perk_len CHECK (char_length(perk_description) <= 500),
    CONSTRAINT venue_pop_up_hubs_category_len CHECK (char_length(category_target) <= 80),
    CONSTRAINT venue_pop_up_hubs_duration CHECK (
        duration_minutes >= 15
        AND duration_minutes <= 10080
    )
);

CREATE INDEX IF NOT EXISTS idx_venue_pop_up_hubs_venue ON public.venue_pop_up_hubs (venue_id);

CREATE INDEX IF NOT EXISTS idx_venue_pop_up_hubs_ends_at ON public.venue_pop_up_hubs (ends_at);

ALTER TABLE public.venue_pop_up_hubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_pop_up_hubs_select_managers" ON public.venue_pop_up_hubs;

CREATE POLICY "venue_pop_up_hubs_select_managers"
    ON public.venue_pop_up_hubs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.venue_managers vm
            WHERE vm.venue_id = venue_pop_up_hubs.venue_id
              AND vm.user_id = auth.uid ()
        )
    );

DROP POLICY IF EXISTS "venue_pop_up_hubs_insert_managers" ON public.venue_pop_up_hubs;

CREATE POLICY "venue_pop_up_hubs_insert_managers"
    ON public.venue_pop_up_hubs
    FOR INSERT
    WITH CHECK (
        created_by = auth.uid ()
        AND EXISTS (
            SELECT 1
            FROM public.venue_managers vm
            WHERE vm.venue_id = venue_pop_up_hubs.venue_id
              AND vm.user_id = auth.uid ()
        )
    );

GRANT SELECT, INSERT ON public.venue_pop_up_hubs TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC — aggregated clusters + category totals within ~1 mile of venue
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_vibe_radar_data (venue_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lat DOUBLE PRECISION;

    v_lng DOUBLE PRECISION;

    clusters JSONB;

    totals JSONB;

    radius_m CONSTANT DOUBLE PRECISION := 1609.34;
    -- ~1 mile; used for manager-facing copy ("within 1 mile")
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    SELECT v.latitude, v.longitude
    INTO v_lat, v_lng
    FROM public.venues v
    WHERE v.id = venue_id_param;

    IF v_lat IS NULL OR v_lng IS NULL THEN
        RETURN jsonb_build_object(
            'clusters',
            '[]'::jsonb,
            'categoryTotals',
            '[]'::jsonb,
            'venueCenter',
            jsonb_build_object('lat', NULL, 'lng', NULL),
            'radiusMeters',
            radius_m,
            'status',
            'venue_coordinates_required'
        );
    END IF;

    WITH spatial AS (
        SELECT
            ai.intent_tag,
            ai.anonymized_cell_id,
            ai.cell_center_lat,
            ai.cell_center_lng
        FROM public.availability_intents ai
        WHERE
            ai.expires_at > now()
            AND ai.anonymized_cell_id IS NOT NULL
            AND ai.cell_center_lat IS NOT NULL
            AND ai.cell_center_lng IS NOT NULL
            AND (
                6371000.0 * acos(
                    LEAST(
                        1.0::DOUBLE PRECISION,
                        GREATEST(
                            -1.0::DOUBLE PRECISION,
                            cos(radians(v_lat)) * cos(radians(ai.cell_center_lat)) * cos(
                                radians(ai.cell_center_lng) - radians(v_lng)
                            ) + sin(radians(v_lat)) * sin(radians(ai.cell_center_lat))
                        )
                    )
                )
            )
            <= radius_m
    ),
    cluster_agg AS (
        SELECT
            s.anonymized_cell_id AS hex_id,
            s.intent_tag AS category,
            COUNT(*)::bigint AS count,
            AVG(s.cell_center_lng)::DOUBLE PRECISION AS approx_lng,
            AVG(s.cell_center_lat)::DOUBLE PRECISION AS approx_lat
        FROM spatial s
        GROUP BY
            s.anonymized_cell_id,
            s.intent_tag
        HAVING
            COUNT(*) >= 3
    ),
    tag_totals AS (
        SELECT
            s.intent_tag AS category,
            COUNT(*)::bigint AS count
        FROM spatial s
        GROUP BY
            s.intent_tag
        HAVING
            COUNT(*) >= 5
    )
    SELECT
        COALESCE(
            (
                SELECT
                    jsonb_agg(
                        jsonb_build_object(
                            'hex_id',
                            c.hex_id,
                            'category',
                            c.category,
                            'count',
                            c.count,
                            'approx_lng',
                            c.approx_lng,
                            'approx_lat',
                            c.approx_lat
                        )
                    )
                FROM cluster_agg c
            ),
            '[]'::jsonb
        ),
        COALESCE(
            (
                SELECT
                    jsonb_agg(
                        jsonb_build_object(
                            'category',
                            t.category,
                            'count',
                            t.count
                        )
                    )
                FROM tag_totals t
            ),
            '[]'::jsonb
        )
    INTO clusters, totals;

    RETURN jsonb_build_object(
        'clusters',
        clusters,
        'categoryTotals',
        totals,
        'venueCenter',
        jsonb_build_object('lat', v_lat, 'lng', v_lng),
        'radiusMeters',
        radius_m,
        'status',
        'ok'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.insights_vibe_radar_data (UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insights_vibe_radar_data (UUID) TO authenticated;

COMMENT ON FUNCTION public.insights_vibe_radar_data (UUID) IS
    'Anonymized intent clusters and category totals near a venue; managers only.';
