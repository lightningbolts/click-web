-- Peer percentiles for Business Insights (network cohort, k-anonymity on cohort size).
-- Internal metric helpers have NO manager check — only callable from insights_peer_percentiles (SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- _metrics_vlc_for_venue — same logic as calculate_vlc without auth assert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._metrics_vlc_for_venue (venue_id_param UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r NUMERIC;
BEGIN
    WITH conn_at_venue AS (
        SELECT
            c.id,
            c.created,
            c.user_ids
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param
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

REVOKE ALL ON FUNCTION public._metrics_vlc_for_venue (UUID) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- _metrics_gcr_for_venue
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._metrics_gcr_for_venue (venue_id_param UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r NUMERIC;
BEGIN
    WITH venue_conns AS (
        SELECT
            c.id,
            c.created,
            public.resolve_connection_venue_id (c.venue_id, c.semantic_location) AS vid,
            c.user_ids,
            c.initiator_id,
            c.responder_id
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param
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

REVOKE ALL ON FUNCTION public._metrics_gcr_for_venue (UUID) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- _metrics_psv_velocity_for_venue
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._metrics_psv_velocity_for_venue (venue_id_param UUID)
RETURNS NUMERIC
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
      AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param;

    SELECT COUNT(*)::numeric
    INTO total_conn
    FROM public.connections c
    WHERE c.include_in_business_insights IS DISTINCT FROM false
      AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param;

    IF num_days IS NULL OR num_days = 0 THEN
        RETURN 0::numeric;
    END IF;

    WITH hourly AS (
        SELECT
            EXTRACT(HOUR FROM (to_timestamp(c.created / 1000.0) AT TIME ZONE 'UTC'))::int AS hr,
            COUNT(*)::numeric AS cnt
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param
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

REVOKE ALL ON FUNCTION public._metrics_psv_velocity_for_venue (UUID) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- _metrics_wri_index_for_venue — resilience index only (NULL if undefined)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._metrics_wri_index_for_venue (venue_id_param UUID)
RETURNS NUMERIC
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
          AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param
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

REVOKE ALL ON FUNCTION public._metrics_wri_index_for_venue (UUID) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- insights_peer_percentiles — percentile rank vs network cohort (min 5 peers)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insights_peer_percentiles (venue_id_param UUID)
RETURNS JSONB
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
                public.resolve_connection_venue_id (c.venue_id, c.semantic_location) AS vid
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
                public.resolve_connection_venue_id (c.venue_id, c.semantic_location) AS vid
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

    -- VLC
    WITH cohort AS (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id (c.venue_id, c.semantic_location) AS vid
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

    -- GCR
    WITH cohort AS (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id (c.venue_id, c.semantic_location) AS vid
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

    -- PSV velocity
    WITH cohort AS (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id (c.venue_id, c.semantic_location) AS vid
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

    -- WRI (skip peers with NULL index)
    WITH cohort AS (
        SELECT x.vid
        FROM (
            SELECT
                public.resolve_connection_venue_id (c.venue_id, c.semantic_location) AS vid
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

COMMENT ON FUNCTION public.insights_peer_percentiles (UUID) IS
    'Approximate percentile (0–100) vs venues with ≥20 connections; requires ≥5 peer venues. Caller must manage venue_id_param.';

GRANT EXECUTE ON FUNCTION public.insights_peer_percentiles (UUID) TO authenticated;
