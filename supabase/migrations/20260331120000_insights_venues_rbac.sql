-- Phase 1: Click Insights B2B venues, manager RBAC, NFC anchors, metrics mat view.
-- Run via Supabase CLI or SQL editor after prior Click schema migrations.

-- ---------------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location TEXT,
    floorplan_svg_url TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'inactive'
        CHECK (subscription_status IN (
            'inactive', 'incomplete', 'trialing', 'active',
            'past_due', 'canceled', 'unpaid'
        )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venues_stripe_customer ON public.venues (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venues_subscription_status ON public.venues (subscription_status);

CREATE TABLE IF NOT EXISTS public.venue_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'manager'
        CHECK (role IN ('owner', 'manager', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_managers_user ON public.venue_managers (user_id);
CREATE INDEX IF NOT EXISTS idx_venue_managers_venue ON public.venue_managers (venue_id);

CREATE TABLE IF NOT EXISTS public.nfc_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    map_x DOUBLE PRECISION NOT NULL,
    map_y DOUBLE PRECISION NOT NULL,
    qr_token UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (qr_token)
);

CREATE INDEX IF NOT EXISTS idx_nfc_anchors_venue ON public.nfc_anchors (venue_id);

-- Link connections to a venue for aggregations (nullable for legacy rows).
ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues (id) ON DELETE SET NULL;

ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS vibe_rating SMALLINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'connections_vibe_rating_range'
    ) THEN
        ALTER TABLE public.connections
            ADD CONSTRAINT connections_vibe_rating_range
            CHECK (vibe_rating IS NULL OR (vibe_rating >= 1 AND vibe_rating <= 5));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_connections_venue_id ON public.connections (venue_id)
    WHERE venue_id IS NOT NULL;

ALTER TABLE public.connections
    ADD COLUMN IF NOT EXISTS include_in_business_insights BOOLEAN DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. Materialized view: hourly + daily buckets (UTC)
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS public.venue_metrics_materialized AS
WITH conn_resolved AS (
    SELECT
        c.id,
        COALESCE(
            c.venue_id,
            (
                SELECT v.id
                FROM public.venues v
                WHERE lower(trim(v.name)) = lower(trim(c.semantic_location))
                LIMIT 1
            )
        ) AS resolved_venue_id,
        (to_timestamp(c.created / 1000) AT TIME ZONE 'UTC') AS conn_ts,
        c.context_tag_id,
        c.vibe_rating
    FROM public.connections c
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
LEFT JOIN hourly_tags ht
    ON ht.venue_id = h.venue_id AND ht.period_start = h.period_start
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
LEFT JOIN daily_tags dt
    ON dt.venue_id = d.venue_id AND dt.period_start = d.period_start;

CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_metrics_materialized_pk
    ON public.venue_metrics_materialized (venue_id, period_start, bucket_granularity);

-- Invoker-safe read path for dashboard clients (mat view itself: service_role + owner only).
CREATE OR REPLACE VIEW public.venue_metrics WITH (security_invoker = true) AS
SELECT m.*
FROM public.venue_metrics_materialized m
WHERE EXISTS (
    SELECT 1
    FROM public.venue_managers vm
    WHERE vm.venue_id = m.venue_id
      AND vm.user_id = auth.uid()
);

COMMENT ON MATERIALIZED VIEW public.venue_metrics_materialized IS
    'Aggregated connection counts, context tag frequencies, and vibe ratings per venue by UTC hour/day. Refresh via REFRESH MATERIALIZED VIEW CONCURRENTLY public.venue_metrics_materialized;';

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfc_anchors ENABLE ROW LEVEL SECURITY;

-- Venues: managers may read/update their venues (Stripe updates use service_role).
DROP POLICY IF EXISTS "venues_select_managers" ON public.venues;
CREATE POLICY "venues_select_managers"
    ON public.venues FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm
            WHERE vm.venue_id = venues.id AND vm.user_id = auth.uid()
        )
    );

-- Authenticated B2B signup creates the venue row; first manager row is added separately (RLS below).
DROP POLICY IF EXISTS "venues_insert_authenticated" ON public.venues;
CREATE POLICY "venues_insert_authenticated"
    ON public.venues FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "venues_update_owners" ON public.venues;
CREATE POLICY "venues_update_owners"
    ON public.venues FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm
            WHERE vm.venue_id = venues.id
              AND vm.user_id = auth.uid()
              AND vm.role IN ('owner', 'manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm
            WHERE vm.venue_id = venues.id
              AND vm.user_id = auth.uid()
              AND vm.role IN ('owner', 'manager')
        )
    );

-- venue_managers: users see only their memberships; inserts via service_role (webhook) or future invite flow.
DROP POLICY IF EXISTS "venue_managers_select_self" ON public.venue_managers;
CREATE POLICY "venue_managers_select_self"
    ON public.venue_managers FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "venue_managers_insert_self_owner" ON public.venue_managers;
CREATE POLICY "venue_managers_insert_self_owner"
    ON public.venue_managers FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND role = 'owner'
        AND NOT EXISTS (
            SELECT 1 FROM public.venue_managers vm2
            WHERE vm2.venue_id = venue_managers.venue_id
        )
    );

DROP POLICY IF EXISTS "venue_managers_insert_by_owner" ON public.venue_managers;
CREATE POLICY "venue_managers_insert_by_owner"
    ON public.venue_managers FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm0
            WHERE vm0.venue_id = venue_managers.venue_id
              AND vm0.user_id = auth.uid()
              AND vm0.role = 'owner'
        )
    );

DROP POLICY IF EXISTS "venue_managers_update_owner_role" ON public.venue_managers;
CREATE POLICY "venue_managers_update_owner_role"
    ON public.venue_managers FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm0
            WHERE vm0.venue_id = venue_managers.venue_id
              AND vm0.user_id = auth.uid()
              AND vm0.role = 'owner'
        )
    );

DROP POLICY IF EXISTS "venue_managers_delete_owner" ON public.venue_managers;
CREATE POLICY "venue_managers_delete_owner"
    ON public.venue_managers FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm0
            WHERE vm0.venue_id = venue_managers.venue_id
              AND vm0.user_id = auth.uid()
              AND vm0.role = 'owner'
        )
    );

-- nfc_anchors: managers for the venue
DROP POLICY IF EXISTS "nfc_anchors_select_managers" ON public.nfc_anchors;
CREATE POLICY "nfc_anchors_select_managers"
    ON public.nfc_anchors FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm
            WHERE vm.venue_id = nfc_anchors.venue_id AND vm.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "nfc_anchors_insert_managers" ON public.nfc_anchors;
CREATE POLICY "nfc_anchors_insert_managers"
    ON public.nfc_anchors FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm
            WHERE vm.venue_id = nfc_anchors.venue_id
              AND vm.user_id = auth.uid()
              AND vm.role IN ('owner', 'manager')
        )
    );

DROP POLICY IF EXISTS "nfc_anchors_update_managers" ON public.nfc_anchors;
CREATE POLICY "nfc_anchors_update_managers"
    ON public.nfc_anchors FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm
            WHERE vm.venue_id = nfc_anchors.venue_id
              AND vm.user_id = auth.uid()
              AND vm.role IN ('owner', 'manager')
        )
    );

DROP POLICY IF EXISTS "nfc_anchors_delete_managers" ON public.nfc_anchors;
CREATE POLICY "nfc_anchors_delete_managers"
    ON public.nfc_anchors FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.venue_managers vm
            WHERE vm.venue_id = nfc_anchors.venue_id
              AND vm.user_id = auth.uid()
              AND vm.role IN ('owner', 'manager')
        )
    );

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.venues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_managers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfc_anchors TO authenticated;
GRANT SELECT ON public.venue_metrics TO authenticated;

REVOKE ALL ON public.venue_metrics_materialized FROM authenticated;
GRANT SELECT ON public.venue_metrics_materialized TO service_role;
