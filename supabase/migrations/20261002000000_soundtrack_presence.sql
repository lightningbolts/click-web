-- F5: "Listening now" on soundtrack beacons — a live, in-range presence signal with a short TTL.
--
-- A soundtrack beacon is a song link pinned at a place (30 s preview; no full playback). Presence
-- is a heartbeat from someone standing near the pin. The public UI shows a count only; names are
-- shown only to people connected to the listener, and never for ghosted users. No pushes, no
-- rankings. Rows are purged by cron-hourly-maintenance once stale. Additive only; ships dark.

INSERT INTO public.feature_flags (key, description, config)
VALUES (
    'soundtrack_presence',
    'Soundtrack beacons: Listening now presence (spec F5).',
    '{"heartbeat_ttl_minutes": 12, "radius_meters": 150}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.beacon_presence (
    beacon_id    UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (beacon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_beacon_presence_recent
    ON public.beacon_presence (beacon_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_beacon_presence_last_seen
    ON public.beacon_presence (last_seen_at);

ALTER TABLE public.beacon_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beacon_presence FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.beacon_presence IS
    'Listening-now heartbeats on soundtrack beacons (server only; GET/POST/DELETE /api/beacons/{id}/listening).';
