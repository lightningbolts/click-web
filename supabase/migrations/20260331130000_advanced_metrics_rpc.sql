-- Advanced Social ROI: schema support + RPCs for VLC, AMS, ACR, CPR.
-- Connections use expiry_state ('kept' = retained); AMS uses the same as "status = kept".

-- ---------------------------------------------------------------------------
-- 1. Columns & check-ins (idempotent)
-- ---------------------------------------------------------------------------

ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS nfc_anchor_id UUID REFERENCES public.nfc_anchors (id) ON DELETE SET NULL;

ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS ambient_noise TEXT;

ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS user_a_tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS user_b_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_connections_nfc_anchor_id ON public.connections (nfc_anchor_id)
    WHERE nfc_anchor_id IS NOT NULL;

COMMENT ON COLUMN public.connections.ambient_noise IS
    'Optional quiet | moderate | loud; falls back to noise_level in ACR RPC.';

CREATE TABLE IF NOT EXISTS public.venue_check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venue_check_ins_venue_time ON public.venue_check_ins (venue_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_venue_check_ins_user ON public.venue_check_ins (user_id);

ALTER TABLE public.venue_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_check_ins_select_managers" ON public.venue_check_ins;
CREATE POLICY "venue_check_ins_select_managers"
    ON public.venue_check_ins FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.venue_managers vm
            WHERE vm.venue_id = venue_check_ins.venue_id
              AND vm.user_id = auth.uid ()
        )
    );

GRANT SELECT ON public.venue_check_ins TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_connection_venue_id (
    p_venue_id UUID,
    p_semantic_location TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        p_venue_id,
        (
            SELECT v.id
            FROM public.venues v
            WHERE p_semantic_location IS NOT NULL
              AND lower(trim(v.name)) = lower(trim(p_semantic_location))
            LIMIT 1
        )
    );
$$;

CREATE OR REPLACE FUNCTION public._assert_venue_manager_for_metrics (venue_id_param UUID)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid () IS NULL THEN
        IF coalesce(
            current_setting('request.jwt.claim.role', true),
            ''
        ) <> 'service_role' THEN
            RAISE EXCEPTION 'not authorized';
        END IF;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.venue_managers vm
        WHERE vm.venue_id = venue_id_param
          AND vm.user_id = auth.uid ()
    ) THEN
        RAISE EXCEPTION 'not authorized';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.connection_noise_bucket (c public.connections)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN c.ambient_noise IS NOT NULL THEN lower(trim(c.ambient_noise))
        WHEN lower(coalesce(c.noise_level::text, '')) IN ('quiet') THEN 'quiet'
        WHEN lower(coalesce(c.noise_level::text, '')) IN ('moderate') THEN 'moderate'
        WHEN lower(coalesce(c.noise_level::text, '')) IN ('loud', 'very_loud') THEN 'loud'
        ELSE NULL
    END;
$$;

-- ---------------------------------------------------------------------------
-- 3. calculate_vlc — % of users with a first venue connection who return
--    (another connection or check-in at same venue) more than 24h later.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_vlc (venue_id_param UUID)
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

-- ---------------------------------------------------------------------------
-- 4. calculate_ams — per-anchor share × kept rate (expiry_state = kept)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_ams (venue_id_param UUID)
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

    WITH conn_at_venue AS (
        SELECT
            c.id,
            c.nfc_anchor_id,
            c.expiry_state
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param
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

-- ---------------------------------------------------------------------------
-- 5. calculate_acr — retention % by noise bucket (quiet / moderate / loud)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_acr (venue_id_param UUID)
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

    WITH conn_at_venue AS (
        SELECT
            c.id,
            public.connection_noise_bucket (c) AS bucket,
            c.expiry_state
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param
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

-- ---------------------------------------------------------------------------
-- 6. calculate_cpr — % of connections where |tags A ∩ tags B| is 0 or 1
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_cpr (venue_id_param UUID)
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

    WITH conn_at_venue AS (
        SELECT
            c.user_a_tags,
            c.user_b_tags
        FROM public.connections c
        WHERE c.include_in_business_insights IS DISTINCT FROM false
          AND public.resolve_connection_venue_id (c.venue_id, c.semantic_location) = venue_id_param
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

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.calculate_vlc (UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_ams (UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_acr (UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_cpr (UUID) TO authenticated;
