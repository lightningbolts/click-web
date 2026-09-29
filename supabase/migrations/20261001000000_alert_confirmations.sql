-- F4: crowd confirmation for alert (hazard) beacons, so stale hazard pins don't linger.
--
-- "Still here" extends an alert's expiry; enough distinct "Cleared" votes (or the creator) clear it
-- for everyone. Votes need the voter near the pin; their coordinates are checked, never stored.
-- Numbers live in feature_flags.config (alert_confirmations) and are read by click-web.
-- Additive only; ships dark.

INSERT INTO public.feature_flags (key, description, config)
VALUES (
    'alert_confirmations',
    'Alert beacons: Still here / Cleared confirmations and quiet reports (spec F4).',
    '{"ttl_minutes": 120, "radius_meters": 300, "cleared_threshold": 2, "vote_window_minutes": 120, "max_lifetime_hours": 24}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.beacon_confirmations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beacon_id  UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    status     TEXT NOT NULL CHECK (status IN ('still_here', 'cleared')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beacon_confirmations_beacon
    ON public.beacon_confirmations (beacon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beacon_confirmations_user
    ON public.beacon_confirmations (user_id);

ALTER TABLE public.beacon_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beacon_confirmations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.beacon_confirmations IS
    'Still here / Cleared votes on alert beacons (server only; POST /api/beacons/{id}/confirm).';

-- When an alert was cleared (by its creator or the crowd); expires_at is set to the same instant so
-- every client drops it. Null for alerts that simply expired.
ALTER TABLE public.map_beacons ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;
