-- Privacy-first friction telemetry aggregates (no user_id, no coordinates).

CREATE TABLE IF NOT EXISTS public.system_friction_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    duration_sec integer,
    pan_count integer,
    hexbin_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT system_friction_logs_event_type_len CHECK (char_length(event_type) <= 64),
    CONSTRAINT system_friction_logs_hexbin_len CHECK (
        hexbin_id IS NULL OR char_length(hexbin_id) <= 64
    ),
    CONSTRAINT system_friction_logs_duration_nonneg CHECK (
        duration_sec IS NULL OR duration_sec >= 0
    ),
    CONSTRAINT system_friction_logs_pan_nonneg CHECK (
        pan_count IS NULL OR pan_count >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_system_friction_logs_created_at
    ON public.system_friction_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_friction_logs_event_type
    ON public.system_friction_logs (event_type, created_at DESC);

COMMENT ON TABLE public.system_friction_logs IS
    'Anonymized UI friction signals — no user identifiers or raw GPS.';

ALTER TABLE public.system_friction_logs ENABLE ROW LEVEL SECURITY;

-- Service role / cron only — clients write via Next.js BFF, not direct PostgREST.
REVOKE ALL ON public.system_friction_logs FROM PUBLIC;
REVOKE ALL ON public.system_friction_logs FROM authenticated;
GRANT SELECT, INSERT ON public.system_friction_logs TO service_role;
