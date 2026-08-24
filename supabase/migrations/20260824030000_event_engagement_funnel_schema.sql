-- Engagement funnel schema: anonymous session id, share tokens, daily rollup.
-- Additive. App still writes event_view / share via existing BFF routes.
-- Do not add an event_type CHECK enum (would break bookmark_set, rsvp_set, etc.).

ALTER TABLE public.event_engagement_events
    ADD COLUMN IF NOT EXISTS anonymous_session_id TEXT NULL;

COMMENT ON COLUMN public.event_engagement_events.anonymous_session_id IS
    'Client-generated non-PII session token for de-duplicating logged-out views. Unused until a follow-up PR.';

COMMENT ON TABLE public.event_engagement_events IS
    'Append-only event engagement telemetry. Service-role writes only. Live event_type values: event_view, bookmark_set, bookmark_unset, rsvp_set, rsvp_unset, check_in, check_out, check_in_rejected, share. Schema also accepts impression and link_click (unused until follow-up). user_id is nullable for anonymous microsite views.';

CREATE TABLE IF NOT EXISTS public.beacon_share_tokens (
    token TEXT PRIMARY KEY,
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    shared_by_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beacon_share_tokens_beacon
    ON public.beacon_share_tokens (beacon_id);

COMMENT ON TABLE public.beacon_share_tokens IS
    'Share-link attribution (?ref=token on /e/{beaconId}). Unused until a follow-up PR wires BFF writes and link_click events.';

ALTER TABLE public.beacon_share_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.beacon_share_tokens FROM PUBLIC;
REVOKE ALL ON public.beacon_share_tokens FROM anon;
REVOKE ALL ON public.beacon_share_tokens FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.beacon_share_tokens TO service_role;

CREATE TABLE IF NOT EXISTS public.event_beacon_daily_stats (
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    stat_date DATE NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    link_clicks INTEGER NOT NULL DEFAULT 0,
    bookmarks INTEGER NOT NULL DEFAULT 0,
    rsvps INTEGER NOT NULL DEFAULT 0,
    check_ins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (beacon_id, stat_date)
);

COMMENT ON TABLE public.event_beacon_daily_stats IS
    'Daily organizer funnel rollup. Unused until /api/cron/event-daily-stats. Dashboards must not query event_engagement_events live after that job exists.';

ALTER TABLE public.event_beacon_daily_stats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.event_beacon_daily_stats FROM PUBLIC;
REVOKE ALL ON public.event_beacon_daily_stats FROM anon;
REVOKE ALL ON public.event_beacon_daily_stats FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_beacon_daily_stats TO service_role;
