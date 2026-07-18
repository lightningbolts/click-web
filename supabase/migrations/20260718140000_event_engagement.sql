-- Event engagement: bookmarks, check-ins, append-only telemetry, RSVP dim parity.

-- ---------------------------------------------------------------------------
-- 1. event_bookmarks (current-state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_bookmarks (
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    minutes_before_start INTEGER,
    source TEXT,
    platform TEXT,
    app_version TEXT,
    PRIMARY KEY (user_id, beacon_id)
);

CREATE INDEX IF NOT EXISTS idx_event_bookmarks_user_created
    ON public.event_bookmarks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_bookmarks_beacon
    ON public.event_bookmarks (beacon_id);

COMMENT ON TABLE public.event_bookmarks IS
    'Per-user saved event beacons (private interest, not attendance).';

ALTER TABLE public.event_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_bookmarks_select_own ON public.event_bookmarks;
CREATE POLICY event_bookmarks_select_own
    ON public.event_bookmarks
    FOR SELECT
    TO authenticated
    USING (auth.uid () = user_id);

DROP POLICY IF EXISTS event_bookmarks_insert_own ON public.event_bookmarks;
CREATE POLICY event_bookmarks_insert_own
    ON public.event_bookmarks
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid () = user_id);

DROP POLICY IF EXISTS event_bookmarks_update_own ON public.event_bookmarks;
CREATE POLICY event_bookmarks_update_own
    ON public.event_bookmarks
    FOR UPDATE
    TO authenticated
    USING (auth.uid () = user_id)
    WITH CHECK (auth.uid () = user_id);

DROP POLICY IF EXISTS event_bookmarks_delete_own ON public.event_bookmarks;
CREATE POLICY event_bookmarks_delete_own
    ON public.event_bookmarks
    FOR DELETE
    TO authenticated
    USING (auth.uid () = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_bookmarks TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. event_check_ins (current-state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_check_ins (
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_out_at TIMESTAMPTZ,
    check_in_count INTEGER NOT NULL DEFAULT 1,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy_meters DOUBLE PRECISION,
    distance_meters DOUBLE PRECISION,
    radius_meters_applied DOUBLE PRECISION,
    venue_scale TEXT,
    had_rsvp BOOLEAN NOT NULL DEFAULT false,
    had_bookmark BOOLEAN NOT NULL DEFAULT false,
    client_occurred_at TIMESTAMPTZ,
    source TEXT,
    platform TEXT,
    app_version TEXT,
    minutes_after_start INTEGER,
    PRIMARY KEY (user_id, beacon_id)
);

CREATE INDEX IF NOT EXISTS idx_event_check_ins_beacon
    ON public.event_check_ins (beacon_id);

CREATE INDEX IF NOT EXISTS idx_event_check_ins_user
    ON public.event_check_ins (user_id);

CREATE INDEX IF NOT EXISTS idx_event_check_ins_checked_in
    ON public.event_check_ins (beacon_id, checked_in_at DESC)
    WHERE checked_out_at IS NULL;

COMMENT ON TABLE public.event_check_ins IS
    'Per-user on-site check-in for event beacons (presence, not RSVP).';

ALTER TABLE public.event_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_check_ins_select_own ON public.event_check_ins;
CREATE POLICY event_check_ins_select_own
    ON public.event_check_ins
    FOR SELECT
    TO authenticated
    USING (auth.uid () = user_id);

DROP POLICY IF EXISTS event_check_ins_insert_own ON public.event_check_ins;
CREATE POLICY event_check_ins_insert_own
    ON public.event_check_ins
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid () = user_id);

DROP POLICY IF EXISTS event_check_ins_update_own ON public.event_check_ins;
CREATE POLICY event_check_ins_update_own
    ON public.event_check_ins
    FOR UPDATE
    TO authenticated
    USING (auth.uid () = user_id)
    WITH CHECK (auth.uid () = user_id);

DROP POLICY IF EXISTS event_check_ins_delete_own ON public.event_check_ins;
CREATE POLICY event_check_ins_delete_own
    ON public.event_check_ins
    FOR DELETE
    TO authenticated
    USING (auth.uid () = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_check_ins TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. event_engagement_events (append-only telemetry)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_engagement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
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
    CONSTRAINT event_engagement_events_type_len CHECK (char_length(event_type) <= 64),
    CONSTRAINT event_engagement_events_reject_len CHECK (
        reject_reason IS NULL OR char_length(reject_reason) <= 64
    ),
    CONSTRAINT event_engagement_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_event_engagement_events_beacon_occurred
    ON public.event_engagement_events (beacon_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_engagement_events_venue_occurred
    ON public.event_engagement_events (venue_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_engagement_events_type_occurred
    ON public.event_engagement_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_engagement_events_user_occurred
    ON public.event_engagement_events (user_id, occurred_at DESC);

COMMENT ON TABLE public.event_engagement_events IS
    'Append-only event engagement telemetry (views, bookmarks, RSVP, check-ins, rejects). Service-role writes only.';

ALTER TABLE public.event_engagement_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.event_engagement_events FROM PUBLIC;
REVOKE ALL ON public.event_engagement_events FROM authenticated;
GRANT SELECT, INSERT ON public.event_engagement_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. beacon_attendees RSVP dim parity
-- ---------------------------------------------------------------------------
ALTER TABLE public.beacon_attendees
    ADD COLUMN IF NOT EXISTS accuracy_meters DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS app_version TEXT,
    ADD COLUMN IF NOT EXISTS client_occurred_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS minutes_before_start INTEGER,
    ADD COLUMN IF NOT EXISTS distance_meters DOUBLE PRECISION;

COMMENT ON COLUMN public.beacon_attendees.accuracy_meters IS
    'Optional GPS accuracy (meters) at RSVP time.';
COMMENT ON COLUMN public.beacon_attendees.source IS
    'Client source (mobile|web) at RSVP time.';
COMMENT ON COLUMN public.beacon_attendees.platform IS
    'Client platform (ios|android|web) at RSVP time.';
COMMENT ON COLUMN public.beacon_attendees.app_version IS
    'Client app version at RSVP time.';
COMMENT ON COLUMN public.beacon_attendees.client_occurred_at IS
    'Client clock at RSVP time.';
COMMENT ON COLUMN public.beacon_attendees.minutes_before_start IS
    'Minutes before event_start_at when RSVP was set (negative if after start).';
COMMENT ON COLUMN public.beacon_attendees.distance_meters IS
    'Haversine distance from beacon pin when RSVP included coords.';
