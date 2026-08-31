-- P3.3: empty partitioned shells for append-only analytics.
-- Does NOT cut over writes. Old tables stay live. No data copy in this migration.
-- Partition key: occurred_at for event_engagement_events; created_at for the others.
-- PK is (id, ts) because RANGE partitioning cannot keep a uuid-only primary key.

-- ---------------------------------------------------------------------------
-- Helper: monthly range partitions + DEFAULT for [2026-01, 2027-12]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._create_monthly_partitions (
    parent_regclass REGCLASS,
    prefix TEXT,
    ts_column TEXT,
    start_month DATE DEFAULT DATE '2026-01-01',
    end_month DATE DEFAULT DATE '2027-12-01'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    m DATE;
    next_m DATE;
    part_name TEXT;
BEGIN
    m := start_month;
    WHILE m <= end_month LOOP
        next_m := (m + INTERVAL '1 month')::DATE;
        part_name := prefix || to_char(m, 'YYYY_MM');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
            part_name,
            parent_regclass::TEXT,
            m,
            next_m
        );
        m := next_m;
    END LOOP;

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF %s DEFAULT',
        prefix || 'default',
        parent_regclass::TEXT
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. event_engagement_events_p
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_engagement_events_p (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    beacon_id UUID REFERENCES public.map_beacons (id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    venue_id UUID REFERENCES public.venues (id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_occurred_at TIMESTAMPTZ,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy_meters DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    radius_meters_applied DOUBLE PRECISION,
    venue_scale TEXT,
    minutes_before_start INTEGER,
    minutes_after_start INTEGER,
    had_rsvp BOOLEAN,
    had_bookmark BOOLEAN,
    reject_reason TEXT,
    source TEXT,
    platform TEXT,
    app_version TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    anonymous_session_id TEXT,
    CONSTRAINT event_engagement_events_p_type_len CHECK (char_length(event_type) <= 64),
    CONSTRAINT event_engagement_events_p_reject_len CHECK (
        reject_reason IS NULL OR char_length(reject_reason) <= 64
    ),
    CONSTRAINT event_engagement_events_p_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS idx_event_engagement_events_p_beacon_occurred
    ON public.event_engagement_events_p (beacon_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_engagement_events_p_venue_occurred
    ON public.event_engagement_events_p (venue_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_engagement_events_p_type_occurred
    ON public.event_engagement_events_p (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_engagement_events_p_user_occurred
    ON public.event_engagement_events_p (user_id, occurred_at DESC);

COMMENT ON TABLE public.event_engagement_events_p IS
    'Partitioned shell of event_engagement_events. Unused until a dedicated cutover migration. Live writes stay on event_engagement_events.';

ALTER TABLE public.event_engagement_events_p ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_engagement_events_p FROM PUBLIC;
REVOKE ALL ON public.event_engagement_events_p FROM anon;
REVOKE ALL ON public.event_engagement_events_p FROM authenticated;
GRANT SELECT, INSERT ON public.event_engagement_events_p TO service_role;

SELECT public._create_monthly_partitions (
    'public.event_engagement_events_p'::REGCLASS,
    'event_engagement_events_p_',
    'occurred_at'
);

-- ---------------------------------------------------------------------------
-- 2. proximity_handshake_events_p
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proximity_handshake_events_p (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    user_id TEXT NOT NULL,
    my_token TEXT NOT NULL,
    heard_tokens TEXT[] NOT NULL DEFAULT '{}',
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lux_level DOUBLE PRECISION,
    motion_variance DOUBLE PRECISION,
    compass_azimuth DOUBLE PRECISION,
    battery_level INTEGER,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS proximity_handshake_events_p_created_at_idx
    ON public.proximity_handshake_events_p (created_at DESC);

CREATE INDEX IF NOT EXISTS proximity_handshake_events_p_user_created_idx
    ON public.proximity_handshake_events_p (user_id, created_at DESC);

COMMENT ON TABLE public.proximity_handshake_events_p IS
    'Partitioned shell of proximity_handshake_events. Unused until cutover. Live writes stay on proximity_handshake_events.';

ALTER TABLE public.proximity_handshake_events_p ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proximity_handshake_events_p FROM PUBLIC;
REVOKE ALL ON public.proximity_handshake_events_p FROM anon;
REVOKE ALL ON public.proximity_handshake_events_p FROM authenticated;
GRANT SELECT, INSERT ON public.proximity_handshake_events_p TO service_role;

SELECT public._create_monthly_partitions (
    'public.proximity_handshake_events_p'::REGCLASS,
    'proximity_handshake_events_p_',
    'created_at'
);

-- ---------------------------------------------------------------------------
-- 3. connection_flow_events_p
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connection_flow_events_p (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    event_type TEXT NOT NULL,
    peer_count INTEGER,
    is_group BOOLEAN,
    is_reconnect BOOLEAN,
    selected_count INTEGER,
    candidate_count INTEGER,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT connection_flow_events_p_event_type_len CHECK (char_length(event_type) <= 64),
    CONSTRAINT connection_flow_events_p_reason_len CHECK (
        reason IS NULL OR char_length(reason) <= 128
    ),
    CONSTRAINT connection_flow_events_p_peer_nonneg CHECK (
        peer_count IS NULL OR peer_count >= 0
    ),
    CONSTRAINT connection_flow_events_p_selected_nonneg CHECK (
        selected_count IS NULL OR selected_count >= 0
    ),
    CONSTRAINT connection_flow_events_p_candidate_nonneg CHECK (
        candidate_count IS NULL OR candidate_count >= 0
    ),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_connection_flow_events_p_created_at
    ON public.connection_flow_events_p (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connection_flow_events_p_event_type
    ON public.connection_flow_events_p (event_type, created_at DESC);

COMMENT ON TABLE public.connection_flow_events_p IS
    'Partitioned shell of connection_flow_events. Unused until cutover. Live writes stay on connection_flow_events.';

ALTER TABLE public.connection_flow_events_p ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.connection_flow_events_p FROM PUBLIC;
REVOKE ALL ON public.connection_flow_events_p FROM anon;
REVOKE ALL ON public.connection_flow_events_p FROM authenticated;
GRANT SELECT, INSERT ON public.connection_flow_events_p TO service_role;

SELECT public._create_monthly_partitions (
    'public.connection_flow_events_p'::REGCLASS,
    'connection_flow_events_p_',
    'created_at'
);

-- ---------------------------------------------------------------------------
-- 4. system_friction_logs_p
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_friction_logs_p (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    event_type TEXT NOT NULL,
    duration_sec INTEGER,
    pan_count INTEGER,
    hexbin_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT system_friction_logs_p_event_type_len CHECK (char_length(event_type) <= 64),
    CONSTRAINT system_friction_logs_p_hexbin_len CHECK (
        hexbin_id IS NULL OR char_length(hexbin_id) <= 64
    ),
    CONSTRAINT system_friction_logs_p_duration_nonneg CHECK (
        duration_sec IS NULL OR duration_sec >= 0
    ),
    CONSTRAINT system_friction_logs_p_pan_nonneg CHECK (
        pan_count IS NULL OR pan_count >= 0
    ),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_system_friction_logs_p_created_at
    ON public.system_friction_logs_p (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_friction_logs_p_event_type
    ON public.system_friction_logs_p (event_type, created_at DESC);

COMMENT ON TABLE public.system_friction_logs_p IS
    'Partitioned shell of system_friction_logs. Unused until cutover. Live writes stay on system_friction_logs.';

ALTER TABLE public.system_friction_logs_p ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_friction_logs_p FROM PUBLIC;
REVOKE ALL ON public.system_friction_logs_p FROM anon;
REVOKE ALL ON public.system_friction_logs_p FROM authenticated;
GRANT SELECT, INSERT ON public.system_friction_logs_p TO service_role;

SELECT public._create_monthly_partitions (
    'public.system_friction_logs_p'::REGCLASS,
    'system_friction_logs_p_',
    'created_at'
);

REVOKE ALL ON FUNCTION public._create_monthly_partitions (REGCLASS, TEXT, TEXT, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._create_monthly_partitions (REGCLASS, TEXT, TEXT, DATE, DATE) FROM anon;
REVOKE ALL ON FUNCTION public._create_monthly_partitions (REGCLASS, TEXT, TEXT, DATE, DATE) FROM authenticated;
