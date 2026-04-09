-- Narrow Vibe Radar proximity from 1 mi to ½ mi (idempotent CREATE OR REPLACE).
-- Safe if 20260409120000 already defined the function with either radius.

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

    radius_m CONSTANT DOUBLE PRECISION := 804.67;
    -- ~½ mile (1609.34 m/mi ÷ 2)
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
    'Anonymized intent clusters and category totals near a venue (½ mi); managers only.';
