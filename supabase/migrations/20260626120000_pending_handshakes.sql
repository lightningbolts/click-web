-- Async proximity handshake store for Next.js /api/connections/proximity.
-- Replaces the 5-minute sliding window on proximity_handshake_events with a 48-hour TTL
-- so offline clients can match hours apart.

CREATE TABLE IF NOT EXISTS public.pending_handshakes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    my_token text NOT NULL,
    heard_tokens text[] NOT NULL DEFAULT '{}',
    lat double precision,
    lon double precision,
    lux_level double precision,
    motion_variance double precision,
    compass_azimuth double precision,
    battery_level integer,
    sensor_payload jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    matched_at timestamptz
);

CREATE INDEX IF NOT EXISTS pending_handshakes_expires_at_idx
    ON public.pending_handshakes (expires_at);

CREATE INDEX IF NOT EXISTS pending_handshakes_user_created_idx
    ON public.pending_handshakes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pending_handshakes_heard_tokens_gin
    ON public.pending_handshakes USING gin (heard_tokens);

COMMENT ON TABLE public.pending_handshakes IS
    'Tri-factor proximity payloads awaiting async peer match (48h TTL). Written and matched exclusively by /api/connections/proximity (service role).';

ALTER TABLE public.pending_handshakes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pending_handshakes FROM anon;
REVOKE ALL ON public.pending_handshakes FROM authenticated;
