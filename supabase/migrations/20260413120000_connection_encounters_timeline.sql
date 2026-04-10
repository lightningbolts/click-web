-- Friendship timeline: connection_encounters (1-to-many memory per connection edge).
-- Migrates environmental fields off public.connections; updates metrics + mat view; RLS + RPC + trigger.

CREATE EXTENSION IF NOT EXISTS postgis;

-- PostGIS types / functions live in `extensions` on hosted Supabase.
SET search_path = public, extensions, pg_temp;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.connection_encounters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    connection_id uuid NOT NULL REFERENCES public.connections (id) ON DELETE CASCADE,
    encountered_at timestamptz NOT NULL DEFAULT now(),
    location_name text,
    gps_coordinates geography (Point, 4326),
    /** Denormalized WGS84 for mobile / PostgREST clients (mirrors [gps_coordinates]). */
    gps_lat double precision,
    gps_lon double precision,
    weather_snapshot jsonb,
    noise_level text,
    elevation_category text,
    context_tags text[] NOT NULL DEFAULT '{}'::text[]
);

CREATE INDEX IF NOT EXISTS idx_connection_encounters_conn_time ON public.connection_encounters (connection_id, encountered_at DESC);

COMMENT ON TABLE public.connection_encounters IS
    'Per-crossing environmental context; origin row (oldest encountered_at) is protected from selective delete.';

-- ---------------------------------------------------------------------------
-- 2. Backfill from connections (first encounter = origin story)
-- ---------------------------------------------------------------------------

INSERT INTO public.connection_encounters (
    connection_id,
    encountered_at,
    location_name,
    gps_coordinates,
    gps_lat,
    gps_lon,
    weather_snapshot,
    noise_level,
    elevation_category,
    context_tags
)
SELECT
    c.id,
    COALESCE(
        (c.created_utc)::timestamptz,
        to_timestamp(c.created / 1000.0) AT TIME ZONE 'UTC',
        now()
    ) AS encountered_at,
    NULLIF(trim(c.semantic_location), ''),
    CASE
        WHEN c.geo_location IS NOT NULL
        AND (c.geo_location->>'lat')::double precision IS NOT NULL
        AND (c.geo_location->>'lon')::double precision IS NOT NULL
        AND NOT (
            (c.geo_location->>'lat')::double precision = 0
            AND (c.geo_location->>'lon')::double precision = 0
        ) THEN
            ST_SetSRID(
                ST_MakePoint(
                    (c.geo_location->>'lon')::double precision,
                    (c.geo_location->>'lat')::double precision
                ),
                4326
            )::geography
        ELSE NULL
    END,
    CASE
        WHEN c.geo_location IS NOT NULL
        AND (c.geo_location->>'lat')::double precision IS NOT NULL
        AND (c.geo_location->>'lon')::double precision IS NOT NULL
        AND NOT (
            (c.geo_location->>'lat')::double precision = 0
            AND (c.geo_location->>'lon')::double precision = 0
        ) THEN (c.geo_location->>'lat')::double precision
        ELSE NULL
    END,
    CASE
        WHEN c.geo_location IS NOT NULL
        AND (c.geo_location->>'lat')::double precision IS NOT NULL
        AND (c.geo_location->>'lon')::double precision IS NOT NULL
        AND NOT (
            (c.geo_location->>'lat')::double precision = 0
            AND (c.geo_location->>'lon')::double precision = 0
        ) THEN (c.geo_location->>'lon')::double precision
        ELSE NULL
    END,
    COALESCE((c.memory_capsule::jsonb) -> 'weatherSnapshot', '{}'::jsonb),
    NULLIF(trim(c.noise_level::text), ''),
    NULLIF(trim(c.height_category::text), ''),
    CASE
        WHEN c.context_tag_id IS NOT NULL AND trim(c.context_tag_id) <> '' THEN ARRAY[trim(c.context_tag_id)]::text[]
        ELSE ARRAY[]::text[]
    END
FROM public.connections c
WHERE NOT EXISTS (
        SELECT 1
        FROM public.connection_encounters e
        WHERE e.connection_id = c.id
    );

-- ---------------------------------------------------------------------------
-- 3. Metrics helper: venue resolution from origin encounter location
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_connection_venue_id_from_row (c public.connections)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT
    public.resolve_connection_venue_id (
        c.venue_id,
        (
            SELECT e.location_name
            FROM public.connection_encounters e
            WHERE e.connection_id = c.id
            ORDER BY e.encountered_at ASC NULLS LAST
            LIMIT 1
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.connection_weather_condition_raw (c public.connections)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT
    NULLIF(
        trim(
            (
                SELECT e.weather_snapshot #>> '{condition}'
                FROM public.connection_encounters e
                WHERE e.connection_id = c.id
                ORDER BY e.encountered_at ASC NULLS LAST
                LIMIT 1
            )
        ),
        ''
    );
$$;

COMMENT ON FUNCTION public.connection_weather_condition_raw (public.connections) IS
    'Weather label from origin encounter weather_snapshot.condition.';

CREATE OR REPLACE FUNCTION public.connection_noise_bucket (c public.connections)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
SELECT
    CASE
        WHEN c.ambient_noise IS NOT NULL THEN lower(trim(c.ambient_noise))
        WHEN lower(
            trim(
                coalesce(
                    (
                        SELECT e.noise_level
                        FROM public.connection_encounters e
                        WHERE e.connection_id = c.id
                        ORDER BY e.encountered_at ASC NULLS LAST
                        LIMIT 1
                    ),
                    ''
                )
            )
        ) IN ('quiet') THEN 'quiet'
        WHEN lower(
            trim(
                coalesce(
                    (
                        SELECT e.noise_level
                        FROM public.connection_encounters e
                        WHERE e.connection_id = c.id
                        ORDER BY e.encountered_at ASC NULLS LAST
                        LIMIT 1
                    ),
                    ''
                )
            )
        ) IN ('moderate') THEN 'moderate'
        WHEN lower(
            trim(
                coalesce(
                    (
                        SELECT e.noise_level
                        FROM public.connection_encounters e
                        WHERE e.connection_id = c.id
                        ORDER BY e.encountered_at ASC NULLS LAST
                        LIMIT 1
                    ),
                    ''
                )
            )
        ) IN ('loud', 'very_loud') THEN 'loud'
        ELSE NULL
    END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Replace venue metric RPC bodies (semantic_location removed from connections)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_wri (venue_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    out jsonb;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    WITH venue_conns AS (
        SELECT
            c.id,
            (to_timestamp(c.created / 1000.0) AT TIME ZONE 'UTC') AS conn_ts,
            public.connection_weather_bucket(public.connection_weather_condition_raw (c)) AS bucket
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
    ),
    per_row AS (
        SELECT
            date_trunc('day', conn_ts)::date AS d,
            bucket
        FROM venue_conns
    ),
    daily AS (
        SELECT
            d,
            COUNT(*)::numeric AS daily_cnt,
            COUNT(*) FILTER (WHERE bucket = 'adverse')::numeric AS n_adverse,
            COUNT(*) FILTER (WHERE bucket = 'fair')::numeric AS n_fair
        FROM per_row
        GROUP BY d
    ),
    day_class AS (
        SELECT
            d,
            daily_cnt,
            CASE
                WHEN n_adverse > n_fair THEN 'adverse'
                WHEN n_fair > n_adverse THEN 'fair'
                ELSE 'neutral'
            END AS day_type
        FROM daily
    ),
    agg AS (
        SELECT
            AVG(daily_cnt) FILTER (WHERE day_type = 'adverse') AS avg_adverse,
            AVG(daily_cnt) FILTER (WHERE day_type = 'fair') AS avg_fair,
            COUNT(*) FILTER (WHERE day_type = 'adverse')::int AS adverse_days,
            COUNT(*) FILTER (WHERE day_type = 'fair')::int AS fair_days
        FROM day_class
    )
    SELECT jsonb_build_object(
        'index',
            CASE
                WHEN agg.avg_fair IS NULL OR agg.avg_fair = 0 THEN NULL
                ELSE round((agg.avg_adverse / agg.avg_fair)::numeric, 4)
            END,
        'avg_daily_adverse', round(COALESCE(agg.avg_adverse, 0::numeric), 4),
        'avg_daily_fair', round(COALESCE(agg.avg_fair, 0::numeric), 4),
        'adverse_days', COALESCE(agg.adverse_days, 0),
        'fair_days', COALESCE(agg.fair_days, 0)
    )
    INTO out
    FROM agg;

    RETURN COALESCE(out, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_psv (venue_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    num_days numeric;
    total_conn numeric;
    peak_h int;
    peak_avg numeric;
    overall_avg numeric;
    vel numeric;
    hourly_avgs numeric[];
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    SELECT COUNT(DISTINCT date_trunc('day', (to_timestamp(c.created / 1000.0) AT TIME ZONE 'UTC')))::numeric
    INTO num_days
    FROM public.connections c
    WHERE c.include_in_business_insights IS DISTINCT FROM false
      AND public.resolve_connection_venue_id_from_row (c) = venue_id_param;

    SELECT COUNT(*)::numeric
    INTO total_conn
    FROM public.connections c
    WHERE c.include_in_business_insights IS DISTINCT FROM false
      AND public.resolve_connection_venue_id_from_row (c) = venue_id_param;

    IF num_days IS NULL OR num_days = 0 THEN
        RETURN jsonb_build_object(
            'peak_hour', 0,
            'velocity', 0,
            'hourly_averages', (
                SELECT to_jsonb(ARRAY(SELECT 0::numeric FROM generate_series(1, 24)))
            ),
            'num_distinct_days', 0,
            'total_connections', COALESCE(total_conn, 0)
        );
    END IF;

    WITH hourly AS (
        SELECT
            EXTRACT(
                HOUR FROM (to_timestamp(c.created / 1000.0) AT TIME ZONE 'UTC')
            )::int AS hr,
            COUNT(*)::numeric AS cnt
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
        GROUP BY 1
    ),
    filled AS (
        SELECT
            gs.hr::int AS hr,
            COALESCE(h.cnt, 0::numeric) AS cnt
        FROM generate_series(0, 23) AS gs (hr)
        LEFT JOIN hourly h ON h.hr = gs.hr
    )
    SELECT
        ARRAY(
            SELECT round((f.cnt / num_days)::numeric, 6)
            FROM filled f
            ORDER BY f.hr
        ),
        (
            SELECT f.hr
            FROM filled f
            ORDER BY f.cnt DESC, f.hr
            LIMIT 1
        ),
        (
            SELECT round((MAX(f.cnt) / num_days)::numeric, 6)
            FROM filled f
        )
    INTO hourly_avgs, peak_h, peak_avg;

    overall_avg := total_conn / (24::numeric * num_days);

    IF overall_avg IS NULL OR overall_avg = 0 THEN
        vel := 0;
    ELSE
        vel := round((peak_avg / overall_avg)::numeric, 4);
    END IF;

    RETURN jsonb_build_object(
        'peak_hour', COALESCE(peak_h, 0),
        'velocity', vel,
        'hourly_averages', to_jsonb(COALESCE(hourly_avgs, ARRAY[]::numeric[])),
        'num_distinct_days', num_days,
        'total_connections', COALESCE(total_conn, 0)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_gcr (venue_id_param uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r numeric;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    WITH venue_conns AS (
        SELECT
            c.id,
            c.created,
            public.resolve_connection_venue_id_from_row (c) AS vid,
            c.user_ids,
            c.initiator_id,
            c.responder_id
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
          AND (
              COALESCE(cardinality(c.user_ids), 0) >= 2
              OR (c.initiator_id IS NOT NULL AND c.responder_id IS NOT NULL)
          )
    ),
    parts AS (
        SELECT DISTINCT
            vc.id AS conn_id,
            u.uid,
            vc.vid,
            vc.created
        FROM venue_conns vc
        CROSS JOIN LATERAL unnest (
            CASE
                WHEN COALESCE(cardinality(vc.user_ids), 0) >= 2 THEN vc.user_ids
                WHEN vc.initiator_id IS NOT NULL AND vc.responder_id IS NOT NULL THEN
                    ARRAY[vc.initiator_id, vc.responder_id]
                ELSE ARRAY[]::uuid[]
            END
        ) AS u (uid)
        WHERE u.uid IS NOT NULL
    ),
    ordered AS (
        SELECT
            conn_id,
            uid,
            vid,
            created,
            LAG(created) OVER (
                PARTITION BY uid, vid
                ORDER BY created ASC, conn_id ASC
            ) AS prev_created,
            LEAD(created) OVER (
                PARTITION BY uid, vid
                ORDER BY created ASC, conn_id ASC
            ) AS next_created
        FROM parts
    ),
    row_mingling AS (
        SELECT
            conn_id,
            (
                prev_created IS NOT NULL
                AND created > prev_created
                AND created - prev_created <= 900000
            )
            OR (
                next_created IS NOT NULL
                AND next_created > created
                AND next_created - created <= 900000
            ) AS neighbor_within_15m
        FROM ordered
    ),
    conn_mingling AS (
        SELECT
            conn_id,
            bool_or(neighbor_within_15m) AS is_mingling
        FROM row_mingling
        GROUP BY conn_id
    ),
    totals AS (
        SELECT
            COUNT(*)::numeric AS n,
            COUNT(*) FILTER (WHERE is_mingling)::numeric AS m
        FROM conn_mingling
    )
    SELECT
        CASE
            WHEN totals.n = 0 THEN 0::numeric
            ELSE round(100 * totals.m / totals.n, 2)
        END
    INTO r
    FROM totals;

    RETURN COALESCE(r, 0::numeric);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_vlc (venue_id_param uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r numeric;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    WITH conn_at_venue AS (
        SELECT
            c.id,
            c.created,
            c.user_ids
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
    ),
    user_first AS (
        SELECT
            u.uid,
            MIN(c.created) AS first_at_venue_ms
        FROM conn_at_venue c
        CROSS JOIN LATERAL unnest (c.user_ids) AS u (uid)
        GROUP BY u.uid
    ),
    loyal AS (
        SELECT uf.uid
        FROM user_first uf
        WHERE EXISTS (
            SELECT 1
            FROM conn_at_venue c2
            CROSS JOIN LATERAL unnest (c2.user_ids) AS u2 (uid)
            WHERE u2.uid = uf.uid
              AND c2.created > uf.first_at_venue_ms + 86400000
        )
           OR EXISTS (
            SELECT 1
            FROM public.venue_check_ins vci
            WHERE vci.venue_id = venue_id_param
              AND vci.user_id = uf.uid
              AND vci.checked_at > to_timestamp(uf.first_at_venue_ms / 1000.0) + interval '24 hours'
        )
    )
    SELECT
        CASE
            WHEN (SELECT COUNT(*)::numeric FROM user_first) = 0 THEN 0::numeric
            ELSE round(
                (SELECT COUNT(*)::numeric FROM loyal) / (SELECT COUNT(*)::numeric FROM user_first) * 100,
                2
            )
        END
    INTO r;

    RETURN COALESCE(r, 0::numeric);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_ams (venue_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    out jsonb;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    WITH conn_at_venue AS (
        SELECT
            c.id,
            c.nfc_anchor_id,
            c.expiry_state
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
          AND c.nfc_anchor_id IS NOT NULL
    ),
    total AS (
        SELECT COUNT(*)::numeric AS tc
        FROM conn_at_venue
    ),
    per_anchor AS (
        SELECT
            na.id AS anchor_id,
            na.name AS anchor_name,
            COUNT(c.id)::numeric AS anchor_count,
            COUNT(*) FILTER (WHERE c.expiry_state = 'kept')::numeric AS kept_count
        FROM public.nfc_anchors na
        INNER JOIN conn_at_venue c ON c.nfc_anchor_id = na.id
        WHERE na.venue_id = venue_id_param
        GROUP BY na.id, na.name
    ),
    scored AS (
        SELECT
            pa.anchor_id,
            pa.anchor_name,
            pa.anchor_count,
            pa.kept_count,
            t.tc,
            CASE
                WHEN pa.anchor_count > 0 THEN round(pa.kept_count / pa.anchor_count, 6)
                ELSE 0::numeric
            END AS anchor_retention,
            CASE
                WHEN t.tc > 0 AND pa.anchor_count > 0 THEN
                    round(
                        (pa.anchor_count / t.tc) * (pa.kept_count / NULLIF (pa.anchor_count, 0)),
                        6
                    )
                ELSE 0::numeric
            END AS ams_score
        FROM per_anchor pa
        CROSS JOIN total t
    )
    SELECT coalesce(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'nfc_anchor_id', s.anchor_id,
                    'name', s.anchor_name,
                    'connection_count', s.anchor_count,
                    'total_count', s.tc,
                    'anchor_retention', s.anchor_retention,
                    'ams_score', s.ams_score
                )
                ORDER BY s.ams_score DESC
            )
            FROM scored s
        ),
        '[]'::jsonb
    )
    INTO out;

    RETURN COALESCE(out, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_acr (venue_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    out jsonb;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    WITH conn_at_venue AS (
        SELECT
            c.id,
            public.connection_noise_bucket (c) AS bucket,
            c.expiry_state
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
    ),
    bucket_stats AS (
        SELECT
            bucket,
            COUNT(*)::numeric AS n,
            COUNT(*) FILTER (WHERE expiry_state = 'kept')::numeric AS kept
        FROM conn_at_venue
        WHERE bucket IS NOT NULL
        GROUP BY bucket
    )
    SELECT coalesce(
        jsonb_object_agg(
            bucket,
            CASE
                WHEN n > 0 THEN round(100 * kept / n, 2)
                ELSE 0::numeric
            END
        ),
        '{}'::jsonb
    )
    INTO out
    FROM bucket_stats;

    RETURN COALESCE(out, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_cpr (venue_id_param uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r numeric;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    WITH conn_at_venue AS (
        SELECT
            c.user_a_tags,
            c.user_b_tags
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
    ),
    tagged AS (
        SELECT
            coalesce(
                cardinality(
                    ARRAY(
                        SELECT unnest(coalesce(user_a_tags, array[]::text[]))
                        INTERSECT
                        SELECT unnest(coalesce(user_b_tags, array[]::text[]))
                    )
                ),
                0
            ) AS overlap_n
        FROM conn_at_venue
    ),
    counts AS (
        SELECT
            COUNT(*)::numeric AS total,
            COUNT(*) FILTER (WHERE overlap_n IN (0, 1))::numeric AS low_overlap
        FROM tagged
    )
    SELECT
        CASE
            WHEN counts.total = 0 THEN 0::numeric
            ELSE round(100 * counts.low_overlap / counts.total, 2)
        END
    INTO r
    FROM counts;

    RETURN COALESCE(r, 0::numeric);
END;
$$;

-- Peer percentile internals
CREATE OR REPLACE FUNCTION public._metrics_vlc_for_venue (venue_id_param uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r numeric;
BEGIN
    WITH conn_at_venue AS (
        SELECT
            c.id,
            c.created,
            c.user_ids
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
    ),
    user_first AS (
        SELECT
            u.uid,
            MIN(c.created) AS first_at_venue_ms
        FROM conn_at_venue c
        CROSS JOIN LATERAL unnest (c.user_ids) AS u (uid)
        GROUP BY u.uid
    ),
    loyal AS (
        SELECT uf.uid
        FROM user_first uf
        WHERE EXISTS (
            SELECT 1
            FROM conn_at_venue c2
            CROSS JOIN LATERAL unnest (c2.user_ids) AS u2 (uid)
            WHERE u2.uid = uf.uid
              AND c2.created > uf.first_at_venue_ms + 86400000
        )
           OR EXISTS (
            SELECT 1
            FROM public.venue_check_ins vci
            WHERE vci.venue_id = venue_id_param
              AND vci.user_id = uf.uid
              AND vci.checked_at > to_timestamp(uf.first_at_venue_ms / 1000.0) + interval '24 hours'
        )
    )
    SELECT
        CASE
            WHEN (SELECT COUNT(*)::numeric FROM user_first) = 0 THEN 0::numeric
            ELSE round(
                (SELECT COUNT(*)::numeric FROM loyal) / (SELECT COUNT(*)::numeric FROM user_first) * 100,
                2
            )
        END
    INTO r;

    RETURN COALESCE(r, 0::numeric);
END;
$$;

CREATE OR REPLACE FUNCTION public._metrics_gcr_for_venue (venue_id_param uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r numeric;
BEGIN
    WITH venue_conns AS (
        SELECT
            c.id,
            c.created,
            public.resolve_connection_venue_id_from_row (c) AS vid,
            c.user_ids,
            c.initiator_id,
            c.responder_id
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
          AND (
              COALESCE(cardinality(c.user_ids), 0) >= 2
              OR (c.initiator_id IS NOT NULL AND c.responder_id IS NOT NULL)
          )
    ),
    parts AS (
        SELECT DISTINCT
            vc.id AS conn_id,
            u.uid,
            vc.vid,
            vc.created
        FROM venue_conns vc
        CROSS JOIN LATERAL unnest (
            CASE
                WHEN COALESCE(cardinality(vc.user_ids), 0) >= 2 THEN vc.user_ids
                WHEN vc.initiator_id IS NOT NULL AND vc.responder_id IS NOT NULL THEN
                    ARRAY[vc.initiator_id, vc.responder_id]
                ELSE ARRAY[]::uuid[]
            END
        ) AS u (uid)
        WHERE u.uid IS NOT NULL
    ),
    ordered AS (
        SELECT
            conn_id,
            uid,
            vid,
            created,
            LAG(created) OVER (
                PARTITION BY uid, vid
                ORDER BY created ASC, conn_id ASC
            ) AS prev_created,
            LEAD(created) OVER (
                PARTITION BY uid, vid
                ORDER BY created ASC, conn_id ASC
            ) AS next_created
        FROM parts
    ),
    row_mingling AS (
        SELECT
            conn_id,
            (
                prev_created IS NOT NULL
                AND created > prev_created
                AND created - prev_created <= 900000
            )
            OR (
                next_created IS NOT NULL
                AND next_created > created
                AND next_created - created <= 900000
            ) AS neighbor_within_15m
        FROM ordered
    ),
    conn_mingling AS (
        SELECT
            conn_id,
            bool_or(neighbor_within_15m) AS is_mingling
        FROM row_mingling
        GROUP BY conn_id
    ),
    totals AS (
        SELECT
            COUNT(*)::numeric AS n,
            COUNT(*) FILTER (WHERE is_mingling)::numeric AS m
        FROM conn_mingling
    )
    SELECT
        CASE
            WHEN totals.n = 0 THEN 0::numeric
            ELSE round(100 * totals.m / totals.n, 2)
        END
    INTO r
    FROM totals;

    RETURN COALESCE(r, 0::numeric);
END;
$$;

CREATE OR REPLACE FUNCTION public._metrics_psv_velocity_for_venue (venue_id_param uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    num_days numeric;
    total_conn numeric;
    peak_h int;
    peak_avg numeric;
    overall_avg numeric;
    vel numeric;
    hourly_avgs numeric[];
BEGIN
    SELECT COUNT(DISTINCT date_trunc('day', (to_timestamp(c.created / 1000.0) AT TIME ZONE 'UTC')))::numeric
    INTO num_days
    FROM public.connections c
    WHERE c.include_in_business_insights IS DISTINCT FROM false
      AND public.resolve_connection_venue_id_from_row (c) = venue_id_param;

    SELECT COUNT(*)::numeric
    INTO total_conn
    FROM public.connections c
    WHERE c.include_in_business_insights IS DISTINCT FROM false
      AND public.resolve_connection_venue_id_from_row (c) = venue_id_param;

    IF num_days IS NULL OR num_days = 0 THEN
        RETURN 0::numeric;
    END IF;

    WITH hourly AS (
        SELECT
            EXTRACT(HOUR FROM (to_timestamp(c.created / 1000.0) AT TIME ZONE 'UTC'))::int AS hr,
            COUNT(*)::numeric AS cnt
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
        GROUP BY 1
    ),
    filled AS (
        SELECT
            gs.hr::int AS hr,
            COALESCE(h.cnt, 0::numeric) AS cnt
        FROM generate_series(0, 23) AS gs (hr)
        LEFT JOIN hourly h ON h.hr = gs.hr
    )
    SELECT
        ARRAY(
            SELECT round((f.cnt / num_days)::numeric, 6)
            FROM filled f
            ORDER BY f.hr
        ),
        (
            SELECT f.hr
            FROM filled f
            ORDER BY f.cnt DESC, f.hr
            LIMIT 1
        ),
        (
            SELECT round((MAX(f.cnt) / num_days)::numeric, 6)
            FROM filled f
        )
    INTO hourly_avgs, peak_h, peak_avg;

    overall_avg := total_conn / (24::numeric * num_days);

    IF overall_avg IS NULL OR overall_avg = 0 THEN
        vel := 0;
    ELSE
        vel := round((peak_avg / overall_avg)::numeric, 4);
    END IF;

    RETURN COALESCE(vel, 0::numeric);
END;
$$;

CREATE OR REPLACE FUNCTION public._metrics_wri_index_for_venue (venue_id_param uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    idx numeric;
BEGIN
    WITH venue_conns AS (
        SELECT
            c.id,
            (to_timestamp(c.created / 1000.0) AT TIME ZONE 'UTC') AS conn_ts,
            public.connection_weather_bucket(public.connection_weather_condition_raw (c)) AS bucket
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id_from_row (c) = venue_id_param
    ),
    per_row AS (
        SELECT
            date_trunc('day', conn_ts)::date AS d,
            bucket
        FROM venue_conns
    ),
    daily AS (
        SELECT
            d,
            COUNT(*)::numeric AS daily_cnt,
            COUNT(*) FILTER (WHERE bucket = 'adverse')::numeric AS n_adverse,
            COUNT(*) FILTER (WHERE bucket = 'fair')::numeric AS n_fair
        FROM per_row
        GROUP BY d
    ),
    day_class AS (
        SELECT
            d,
            daily_cnt,
            CASE
                WHEN n_adverse > n_fair THEN 'adverse'
                WHEN n_fair > n_adverse THEN 'fair'
                ELSE 'neutral'
            END AS day_type
        FROM daily
    ),
    agg AS (
        SELECT
            AVG(daily_cnt) FILTER (WHERE day_type = 'adverse') AS avg_adverse,
            AVG(daily_cnt) FILTER (WHERE day_type = 'fair') AS avg_fair
        FROM day_class
    )
    SELECT
        CASE
            WHEN agg.avg_fair IS NULL OR agg.avg_fair = 0 THEN NULL::numeric
            ELSE round((agg.avg_adverse / agg.avg_fair)::numeric, 4)
        END
    INTO idx
    FROM agg;

    RETURN idx;
END;
$$;

CREATE OR REPLACE FUNCTION public.insights_peer_percentiles (venue_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cohort_size int;
    peer_other int;
    vlc_pct int;
    gcr_pct int;
    psv_pct int;
    wri_pct int;
    denom numeric;
    cnt_lt numeric;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

    SELECT COUNT(*)::int
    INTO cohort_size
    FROM (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id_from_row (c) AS vid
            FROM public.connections c
            WHERE c.include_in_business_insights IS DISTINCT FROM false
        ) x
        WHERE x.vid IS NOT NULL
        GROUP BY x.vid
        HAVING COUNT(*) >= 20
    ) cohort;

    SELECT COUNT(*)::int
    INTO peer_other
    FROM (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id_from_row (c) AS vid
            FROM public.connections c
            WHERE c.include_in_business_insights IS DISTINCT FROM false
        ) x
        WHERE x.vid IS NOT NULL
        GROUP BY x.vid
        HAVING COUNT(*) >= 20
    ) AS cohort_list
    WHERE cohort_list.vid <> venue_id_param;

    IF peer_other < 5 THEN
        RETURN jsonb_build_object(
            'cohortSize', cohort_size,
            'vlc', NULL,
            'gcr', NULL,
            'psv_velocity', NULL,
            'wri', NULL
        );
    END IF;

    WITH cohort AS (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id_from_row (c) AS vid
            FROM public.connections c
            WHERE c.include_in_business_insights IS DISTINCT FROM false
        ) x
        WHERE x.vid IS NOT NULL
        GROUP BY x.vid
        HAVING COUNT(*) >= 20
    ),
    scored AS (
        SELECT
            c.vid,
            public._metrics_vlc_for_venue (c.vid) AS v
        FROM cohort c
    ),
    mine AS (
        SELECT public._metrics_vlc_for_venue (venue_id_param) AS v
    )
    SELECT
        COUNT(*) FILTER (WHERE s.vid <> venue_id_param)::numeric,
        COUNT(*) FILTER (WHERE s.vid <> venue_id_param AND s.v < m.v)::numeric
    INTO denom, cnt_lt
    FROM scored s
    CROSS JOIN mine m;

    vlc_pct := CASE
        WHEN denom IS NULL OR denom < 5 THEN NULL
        ELSE round(100.0 * cnt_lt / NULLIF(denom, 0))::int
    END;

    WITH cohort AS (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id_from_row (c) AS vid
            FROM public.connections c
            WHERE c.include_in_business_insights IS DISTINCT FROM false
        ) x
        WHERE x.vid IS NOT NULL
        GROUP BY x.vid
        HAVING COUNT(*) >= 20
    ),
    scored AS (
        SELECT
            c.vid,
            public._metrics_gcr_for_venue (c.vid) AS v
        FROM cohort c
    ),
    mine AS (
        SELECT public._metrics_gcr_for_venue (venue_id_param) AS v
    )
    SELECT
        COUNT(*) FILTER (WHERE s.vid <> venue_id_param)::numeric,
        COUNT(*) FILTER (WHERE s.vid <> venue_id_param AND s.v < m.v)::numeric
    INTO denom, cnt_lt
    FROM scored s
    CROSS JOIN mine m;

    gcr_pct := CASE
        WHEN denom IS NULL OR denom < 5 THEN NULL
        ELSE round(100.0 * cnt_lt / NULLIF(denom, 0))::int
    END;

    WITH cohort AS (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id_from_row (c) AS vid
            FROM public.connections c
            WHERE c.include_in_business_insights IS DISTINCT FROM false
        ) x
        WHERE x.vid IS NOT NULL
        GROUP BY x.vid
        HAVING COUNT(*) >= 20
    ),
    scored AS (
        SELECT
            c.vid,
            public._metrics_psv_velocity_for_venue (c.vid) AS v
        FROM cohort c
    ),
    mine AS (
        SELECT public._metrics_psv_velocity_for_venue (venue_id_param) AS v
    )
    SELECT
        COUNT(*) FILTER (WHERE s.vid <> venue_id_param)::numeric,
        COUNT(*) FILTER (WHERE s.vid <> venue_id_param AND s.v < m.v)::numeric
    INTO denom, cnt_lt
    FROM scored s
    CROSS JOIN mine m;

    psv_pct := CASE
        WHEN denom IS NULL OR denom < 5 THEN NULL
        ELSE round(100.0 * cnt_lt / NULLIF(denom, 0))::int
    END;

    WITH cohort AS (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id_from_row (c) AS vid
            FROM public.connections c
            WHERE c.include_in_business_insights IS DISTINCT FROM false
        ) x
        WHERE x.vid IS NOT NULL
        GROUP BY x.vid
        HAVING COUNT(*) >= 20
    ),
    scored AS (
        SELECT
            c.vid,
            public._metrics_wri_index_for_venue (c.vid) AS v
        FROM cohort c
    ),
    mine AS (
        SELECT public._metrics_wri_index_for_venue (venue_id_param) AS v
    )
    SELECT
        COUNT(*) FILTER (WHERE s.vid <> venue_id_param AND s.v IS NOT NULL)::numeric,
        COUNT(*) FILTER (
            WHERE s.vid <> venue_id_param
              AND s.v IS NOT NULL
              AND m.v IS NOT NULL
              AND s.v < m.v
        )::numeric
    INTO denom, cnt_lt
    FROM scored s
    CROSS JOIN mine m;

    wri_pct := CASE
        WHEN denom IS NULL OR denom < 5 THEN NULL
        ELSE round(100.0 * cnt_lt / NULLIF(denom, 0))::int
    END;

    RETURN jsonb_build_object(
        'cohortSize', cohort_size,
        'vlc', vlc_pct,
        'gcr', gcr_pct,
        'psv_velocity', psv_pct,
        'wri', wri_pct
    );
END;
$$;

-- Anomaly trigger: remove geo impossibility (coordinates moved to encounters)
CREATE OR REPLACE FUNCTION public.check_connection_anomalies ()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id text;
    v_velocity_count integer;
    v_star_count integer;
    v_now bigint;
    v_ten_minutes_ago bigint;
    v_twenty_four_hours_ago bigint;
    v_should_flag boolean := false;
    v_flag_reasons text[] := '{}';
BEGIN
    v_now := (EXTRACT(epoch FROM now()) * 1000)::bigint;
    v_ten_minutes_ago := v_now - (10 * 60 * 1000);
    v_twenty_four_hours_ago := v_now - (24 * 60 * 60 * 1000);

    FOREACH v_user_id IN ARRAY NEW.user_ids
    LOOP
        SELECT COUNT(*) INTO v_velocity_count
        FROM public.connections
        WHERE user_ids @> ARRAY[v_user_id]
          AND created > v_ten_minutes_ago;

        IF v_velocity_count > 20 THEN
            v_should_flag := true;
            v_flag_reasons := array_append(
                v_flag_reasons,
                'velocity:' || v_user_id || ':' || v_velocity_count || '_in_10min'
            );
        END IF;

        SELECT COUNT(*) INTO v_star_count
        FROM public.connections
        WHERE user_ids @> ARRAY[v_user_id]
          AND created > v_twenty_four_hours_ago;

        IF v_star_count > 100 THEN
            v_should_flag := true;
            v_flag_reasons := array_append(
                v_flag_reasons,
                'star_topology:' || v_user_id || ':' || v_star_count || '_in_24hr'
            );
        END IF;
    END LOOP;

    IF v_should_flag THEN
        NEW.flagged := true;
        NEW.proximity_signals := NEW.proximity_signals || jsonb_build_object('anomaly_flags', v_flag_reasons);
    END IF;

    RETURN NEW;
END;
$$;

-- Materialized view: rebuild without connections.semantic_location / context_tag_id
DROP VIEW IF EXISTS public.venue_metrics CASCADE;

DROP MATERIALIZED VIEW IF EXISTS public.venue_metrics_materialized CASCADE;

CREATE MATERIALIZED VIEW public.venue_metrics_materialized AS
WITH conn_resolved AS (
    SELECT
        c.id,
        COALESCE(
            c.venue_id,
            (
                SELECT v.id
                FROM public.venues v
                WHERE fe.location_name IS NOT NULL
                  AND lower(trim(v.name)) = lower(trim(fe.location_name))
                LIMIT 1
            )
        ) AS resolved_venue_id,
        (to_timestamp(c.created / 1000) AT TIME ZONE 'UTC') AS conn_ts,
        COALESCE(fe.first_tag, '_untagged') AS context_tag_id,
        c.vibe_rating
    FROM public.connections c
    LEFT JOIN LATERAL (
        SELECT
            e.location_name,
            (
                SELECT t
                FROM unnest(COALESCE(e.context_tags, ARRAY[]::text[])) AS t
                LIMIT 1
            ) AS first_tag
        FROM public.connection_encounters e
        WHERE e.connection_id = c.id
        ORDER BY e.encountered_at ASC NULLS LAST
        LIMIT 1
    ) fe ON TRUE
    WHERE c.include_in_business_insights IS DISTINCT FROM false
),
hourly AS (
    SELECT
        resolved_venue_id AS venue_id,
        date_trunc('hour', conn_ts) AS period_start,
        COUNT(*)::bigint AS connection_count,
        (AVG(vibe_rating) FILTER (WHERE vibe_rating IS NOT NULL))::numeric(6, 2) AS vibe_rating_avg,
        (COUNT(*) FILTER (WHERE vibe_rating IS NOT NULL))::bigint AS vibe_rating_samples
    FROM conn_resolved
    WHERE resolved_venue_id IS NOT NULL
    GROUP BY resolved_venue_id, date_trunc('hour', conn_ts)
),
hourly_tags AS (
    SELECT
        x.resolved_venue_id AS venue_id,
        x.period_start,
        COALESCE(
            jsonb_object_agg(x.tag, x.cnt) FILTER (WHERE x.tag IS NOT NULL),
            '{}'::jsonb
        ) AS context_tags
    FROM (
        SELECT
            resolved_venue_id,
            date_trunc('hour', conn_ts) AS period_start,
            COALESCE(context_tag_id, '_untagged') AS tag,
            COUNT(*)::bigint AS cnt
        FROM conn_resolved
        WHERE resolved_venue_id IS NOT NULL
        GROUP BY resolved_venue_id, date_trunc('hour', conn_ts), COALESCE(context_tag_id, '_untagged')
    ) x
    GROUP BY x.resolved_venue_id, x.period_start
),
daily AS (
    SELECT
        resolved_venue_id AS venue_id,
        date_trunc('day', conn_ts) AS period_start,
        COUNT(*)::bigint AS connection_count,
        (AVG(vibe_rating) FILTER (WHERE vibe_rating IS NOT NULL))::numeric(6, 2) AS vibe_rating_avg,
        (COUNT(*) FILTER (WHERE vibe_rating IS NOT NULL))::bigint AS vibe_rating_samples
    FROM conn_resolved
    WHERE resolved_venue_id IS NOT NULL
    GROUP BY resolved_venue_id, date_trunc('day', conn_ts)
),
daily_tags AS (
    SELECT
        y.resolved_venue_id AS venue_id,
        y.period_start,
        COALESCE(
            jsonb_object_agg(y.tag, y.cnt) FILTER (WHERE y.tag IS NOT NULL),
            '{}'::jsonb
        ) AS context_tags
    FROM (
        SELECT
            resolved_venue_id,
            date_trunc('day', conn_ts) AS period_start,
            COALESCE(context_tag_id, '_untagged') AS tag,
            COUNT(*)::bigint AS cnt
        FROM conn_resolved
        WHERE resolved_venue_id IS NOT NULL
        GROUP BY resolved_venue_id, date_trunc('day', conn_ts), COALESCE(context_tag_id, '_untagged')
    ) y
    GROUP BY y.resolved_venue_id, y.period_start
)
SELECT
    h.venue_id,
    h.period_start,
    'hour'::text AS bucket_granularity,
    h.connection_count,
    COALESCE(ht.context_tags, '{}'::jsonb) AS context_tags,
    h.vibe_rating_avg,
    h.vibe_rating_samples
FROM hourly h
LEFT JOIN hourly_tags ht ON ht.venue_id = h.venue_id AND ht.period_start = h.period_start
UNION ALL
SELECT
    d.venue_id,
    d.period_start,
    'day'::text AS bucket_granularity,
    d.connection_count,
    COALESCE(dt.context_tags, '{}'::jsonb) AS context_tags,
    d.vibe_rating_avg,
    d.vibe_rating_samples
FROM daily d
LEFT JOIN daily_tags dt ON dt.venue_id = d.venue_id AND dt.period_start = d.period_start;

CREATE UNIQUE INDEX idx_venue_metrics_materialized_pk ON public.venue_metrics_materialized (venue_id, period_start, bucket_granularity);

CREATE OR REPLACE VIEW public.venue_metrics WITH (security_invoker = true) AS
SELECT m.*
FROM public.venue_metrics_materialized m
WHERE EXISTS (
        SELECT 1
        FROM public.venue_managers vm
        WHERE vm.venue_id = m.venue_id
          AND vm.user_id = auth.uid ()
    );

COMMENT ON MATERIALIZED VIEW public.venue_metrics_materialized IS
    'Aggregated connection counts, context tag frequencies, and vibe ratings per venue by UTC hour/day. Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY public.venue_metrics_materialized;';

-- ---------------------------------------------------------------------------
-- 5. BEFORE INSERT: 3h rate limit + 10k rolling window
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.connection_encounters_before_insert ()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_cnt bigint;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.connection_encounters e
        WHERE e.connection_id = NEW.connection_id
          AND e.encountered_at > (now() - interval '3 hours')
    ) THEN
        RAISE EXCEPTION 'encounter_rate_limit_3h'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*) INTO v_cnt
    FROM public.connection_encounters
    WHERE connection_id = NEW.connection_id;

    IF v_cnt >= 10000 THEN
        DELETE FROM public.connection_encounters e
        WHERE e.id = (
                SELECT id
                FROM public.connection_encounters
                WHERE connection_id = NEW.connection_id
                ORDER BY encountered_at ASC
                LIMIT 1
            );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_encounters_guard ON public.connection_encounters;

CREATE TRIGGER trg_connection_encounters_guard
    BEFORE INSERT ON public.connection_encounters
    FOR EACH ROW
    EXECUTE FUNCTION public.connection_encounters_before_insert ();

-- ---------------------------------------------------------------------------
-- 6. Privacy RPC — cannot delete origin encounter
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_specific_encounter (encounter_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conn uuid;
    v_origin uuid;
BEGIN
    IF auth.uid () IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    SELECT connection_id INTO v_conn
    FROM public.connection_encounters
    WHERE id = encounter_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.id = v_conn
          AND auth.uid ()::text = ANY (c.user_ids)
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    SELECT e.id INTO v_origin
    FROM public.connection_encounters e
    WHERE e.connection_id = v_conn
    ORDER BY e.encountered_at ASC NULLS LAST
    LIMIT 1;

    IF v_origin = encounter_id THEN
        RAISE EXCEPTION 'Cannot delete the origin encounter.'
            USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.connection_encounters
    WHERE id = encounter_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_specific_encounter (uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_specific_encounter (uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS + grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.connection_encounters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connection_encounters_participant_select" ON public.connection_encounters;
CREATE POLICY "connection_encounters_participant_select" ON public.connection_encounters FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.id = connection_encounters.connection_id
          AND auth.uid ()::text = ANY (c.user_ids)
    )
);

DROP POLICY IF EXISTS "connection_encounters_participant_insert" ON public.connection_encounters;
CREATE POLICY "connection_encounters_participant_insert" ON public.connection_encounters FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.id = connection_encounters.connection_id
          AND auth.uid ()::text = ANY (c.user_ids)
    )
);

DROP POLICY IF EXISTS "connection_encounters_participant_delete" ON public.connection_encounters;
CREATE POLICY "connection_encounters_participant_delete" ON public.connection_encounters FOR DELETE TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.id = connection_encounters.connection_id
          AND auth.uid ()::text = ANY (c.user_ids)
    )
);

GRANT SELECT, INSERT, DELETE ON public.connection_encounters TO authenticated;
GRANT ALL ON public.connection_encounters TO service_role;

-- Mutual connections may read peers' active availability_intents rows (mobile profile parity with web API)
DROP POLICY IF EXISTS "availability_intents_select_mutual_connections" ON public.availability_intents;
CREATE POLICY "availability_intents_select_mutual_connections" ON public.availability_intents FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE auth.uid ()::text = ANY (c.user_ids)
          AND availability_intents.user_id::text = ANY (c.user_ids)
    )
);

-- ---------------------------------------------------------------------------
-- 7b. venue_connection_stats — remove dependency on connections.semantic_location
--     (data already lives on connection_encounters from the backfill above).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.venue_connection_stats AS
SELECT
    fe.location_name AS venue_name,
    COUNT(*)::bigint AS total_connections,
    COUNT(*) FILTER (WHERE c.status = 'kept')::bigint AS kept_connections,
    ROUND(
        COUNT(*) FILTER (WHERE c.status = 'kept')::numeric
        / NULLIF(COUNT(*), 0)::numeric,
        2
    ) AS kept_ratio,
    jsonb_agg(
        DISTINCT jsonb_build_object(
            'date', to_char(to_timestamp(c.created / 1000), 'YYYY-MM-DD'),
            'count', 1
        )
    ) FILTER (
        WHERE c.created > (EXTRACT(EPOCH FROM NOW()) * 1000 - 30 * 86400000)::BIGINT
    ) AS daily_raw,
    MODE() WITHIN GROUP (
        ORDER BY EXTRACT(HOUR FROM to_timestamp(c.created / 1000))
    )::int AS peak_hour,
    jsonb_object_agg(
        EXTRACT(HOUR FROM to_timestamp(c.created / 1000))::text,
        1
    ) AS hourly_raw
FROM public.connections c
INNER JOIN LATERAL (
    SELECT NULLIF(trim(e.location_name), '') AS location_name
    FROM public.connection_encounters e
    WHERE e.connection_id = c.id
    ORDER BY e.encountered_at ASC NULLS LAST
    LIMIT 1
) fe ON fe.location_name IS NOT NULL
GROUP BY fe.location_name;

COMMENT ON VIEW public.venue_connection_stats IS
    'Per-venue-name connection stats; venue_name comes from origin encounter location_name (replaces connections.semantic_location).';

-- ---------------------------------------------------------------------------
-- 8. Drop denormalized environmental columns from connections
-- ---------------------------------------------------------------------------

ALTER TABLE public.connections DROP COLUMN IF EXISTS memory_capsule;
ALTER TABLE public.connections DROP COLUMN IF EXISTS full_location;
ALTER TABLE public.connections DROP COLUMN IF EXISTS geo_location;
ALTER TABLE public.connections DROP COLUMN IF EXISTS semantic_location;
ALTER TABLE public.connections DROP COLUMN IF EXISTS weather_condition;
ALTER TABLE public.connections DROP COLUMN IF EXISTS noise_level;
ALTER TABLE public.connections DROP COLUMN IF EXISTS exact_noise_level_db;
ALTER TABLE public.connections DROP COLUMN IF EXISTS height_category;
ALTER TABLE public.connections DROP COLUMN IF EXISTS exact_barometric_elevation_m;
ALTER TABLE public.connections DROP COLUMN IF EXISTS context_tag_id;

GRANT EXECUTE ON FUNCTION public.resolve_connection_venue_id_from_row (public.connections) TO authenticated;
