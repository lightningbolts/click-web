-- Spec §11: the product events the campus pilot is judged on (handshake completion, messages
-- within 48 h, week-two return, drop/nudge use). Allowlisted names, scalar properties from a
-- per-event allowlist, never PII in properties. `user_id` links a person's own events for
-- retention and is deleted with their account. Emission is gated by the pilot_analytics cohort.
-- Handshake completion with group size stays in connection_flow_events
-- (proximity_handshake_matched + peer_count). Additive only; ships dark.

INSERT INTO public.feature_flags (key, description)
VALUES ('pilot_analytics', 'Pilot product events (spec §11); emission only for users in the cohort.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_events (
    id          BIGSERIAL PRIMARY KEY,
    event       TEXT NOT NULL CHECK (event IN (
        'install', 'app_open', 'day2_return', 'day7_return',
        'beacon_created', 'beacon_joined',
        'drop_posted', 'drop_ready_opened', 'recap_opened',
        'nudge_shown', 'nudge_acted'
    )),
    user_id     UUID REFERENCES auth.users (id) ON DELETE CASCADE,
    props       JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(props) = 'object'),
    platform    TEXT CHECK (platform IS NULL OR platform IN ('ios', 'android', 'web')),
    app_version TEXT CHECK (app_version IS NULL OR char_length(app_version) <= 32),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_events_event_time ON public.product_events (event, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_user_event ON public.product_events (user_id, event, occurred_at);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_events FROM PUBLIC, anon, authenticated;
