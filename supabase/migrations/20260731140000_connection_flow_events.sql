-- Privacy-first proximity handshake / connection-flow telemetry (no user_id, no GPS).

CREATE TABLE IF NOT EXISTS public.connection_flow_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    peer_count integer,
    is_group boolean,
    is_reconnect boolean,
    selected_count integer,
    candidate_count integer,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT connection_flow_events_event_type_len CHECK (char_length(event_type) <= 64),
    CONSTRAINT connection_flow_events_reason_len CHECK (
        reason IS NULL OR char_length(reason) <= 128
    ),
    CONSTRAINT connection_flow_events_peer_nonneg CHECK (
        peer_count IS NULL OR peer_count >= 0
    ),
    CONSTRAINT connection_flow_events_selected_nonneg CHECK (
        selected_count IS NULL OR selected_count >= 0
    ),
    CONSTRAINT connection_flow_events_candidate_nonneg CHECK (
        candidate_count IS NULL OR candidate_count >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_connection_flow_events_created_at
    ON public.connection_flow_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connection_flow_events_event_type
    ON public.connection_flow_events (event_type, created_at DESC);

COMMENT ON TABLE public.connection_flow_events IS
    'Anonymized proximity handshake funnel signals — no user identifiers or raw GPS.';

ALTER TABLE public.connection_flow_events ENABLE ROW LEVEL SECURITY;

-- Service role / BFF only — clients write via Next.js, not direct PostgREST.
REVOKE ALL ON public.connection_flow_events FROM PUBLIC;
REVOKE ALL ON public.connection_flow_events FROM authenticated;
GRANT SELECT, INSERT ON public.connection_flow_events TO service_role;
