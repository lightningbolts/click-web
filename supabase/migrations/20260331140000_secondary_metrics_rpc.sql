-- Secondary Advanced Social ROI metrics: WRI, PSV, GCR.
-- Depends on public._assert_venue_manager_for_metrics and public.resolve_connection_venue_id
-- from migration 20260331130000_advanced_metrics_rpc.sql.

-- ---------------------------------------------------------------------------
-- Helpers: weather from memory_capsule JSONB or weather_condition column
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.connection_weather_condition_raw (c public.connections)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        NULLIF(
            trim((c.memory_capsule::jsonb #>> '{weatherSnapshot,condition}')),
            ''
        ),
        NULLIF(trim(c.weather_condition::text), '')
    );
$$;

COMMENT ON FUNCTION public.connection_weather_condition_raw (public.connections) IS
    'Weather label from memory_capsule.weatherSnapshot.condition or connections.weather_condition.';

-- Classify into adverse (rain/snow family) vs fair (clear/sunny) vs neutral (cloudy, unknown).
CREATE OR REPLACE FUNCTION public.connection_weather_bucket (raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN raw IS NULL OR btrim(raw) = '' THEN 'neutral'
        WHEN lower(raw) ~ '(rain|drizzle|storm|snow|sleet|hail|blizzard|snowy|rainy)' THEN 'adverse'
        WHEN lower(raw) ~ '(^|[^a-z])(clear|sunny)([^a-z]|$)' THEN 'fair'
        WHEN lower(raw) IN ('clear', 'sunny') THEN 'fair'
        WHEN lower(raw) LIKE 'sun%' AND lower(raw) NOT LIKE '%cloud%' THEN 'fair'
        ELSE 'neutral'
    END;
$$;

-- ---------------------------------------------------------------------------
-- calculate_wri — avg daily connections on adverse-majority days /
--                 avg daily connections on fair-majority days (UTC days).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_wri (venue_id_param UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    out JSONB;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

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

-- ---------------------------------------------------------------------------
-- calculate_psv — peak hour (max avg connections per calendar day in that hour)
--                 vs mean hourly rate; includes 24 hourly averages for charts.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_psv (venue_id_param UUID)
RETURNS JSONB
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
      AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param;

    SELECT COUNT(*)::numeric
    INTO total_conn
    FROM public.connections c
    WHERE c.include_in_business_insights IS DISTINCT FROM false
      AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param;

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

    RETURN jsonb_build_object(
        'peak_hour', COALESCE(peak_h, 0),
        'velocity', vel,
        'hourly_averages', to_jsonb(COALESCE(hourly_avgs, ARRAY[]::numeric[])),
        'num_distinct_days', num_days,
        'total_connections', COALESCE(total_conn, 0)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- calculate_gcr — % of connections where a participant had another connection
--                 at the same venue within 15 minutes (900000 ms). Uses
--                 LEAD/LAG per (user, venue) — O(n log n) per partition.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_gcr (venue_id_param UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r NUMERIC;
BEGIN
    PERFORM public._assert_venue_manager_for_metrics (venue_id_param);

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

-- Supporting index: speeds venue-scoped scans (optional but helps large tables).
CREATE INDEX IF NOT EXISTS idx_connections_venue_created_metrics
    ON public.connections (venue_id, created)
    WHERE venue_id IS NOT NULL AND include_in_business_insights IS DISTINCT FROM false;

GRANT EXECUTE ON FUNCTION public.calculate_wri (UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_psv (UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_gcr (UUID) TO authenticated;
