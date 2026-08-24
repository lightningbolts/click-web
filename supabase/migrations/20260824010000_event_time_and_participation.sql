-- P0: first-class event time columns on map_beacons + unified event_participation.
-- Additive only. App still reads metadata jsonb and the three legacy tables.

-- ---------------------------------------------------------------------------
-- 1. map_beacons event time (nullable, unused until a later dual-write PR)
-- ---------------------------------------------------------------------------
ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NULL;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NULL;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS event_timezone TEXT NULL;

COMMENT ON COLUMN public.map_beacons.starts_at IS
    'First-class event start (timestamptz). Unused by current app; backfill from metadata.event_start_at. Reads still use metadata until a follow-up PR.';

COMMENT ON COLUMN public.map_beacons.ends_at IS
    'First-class event end (timestamptz). Unused by current app; backfill from metadata.event_end_at.';

COMMENT ON COLUMN public.map_beacons.event_timezone IS
    'IANA timezone name (e.g. America/Los_Angeles). Unused by current app; backfill from metadata.event_timezone.';

CREATE INDEX IF NOT EXISTS idx_map_beacons_starts_at
    ON public.map_beacons (starts_at)
    WHERE starts_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. event_participation (Click-account current-state; guests stay in event_guest_rsvps)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_participation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (
        status IN ('interested', 'bookmarked', 'rsvpd', 'checked_in', 'no_show')
    ),
    bookmarked_at TIMESTAMPTZ NULL,
    rsvpd_at TIMESTAMPTZ NULL,
    checked_in_at TIMESTAMPTZ NULL,
    checked_out_at TIMESTAMPTZ NULL,
    source TEXT NULL,
    platform TEXT NULL,
    app_version TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (beacon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_participation_user
    ON public.event_participation (user_id);

CREATE INDEX IF NOT EXISTS idx_event_participation_beacon_status
    ON public.event_participation (beacon_id, status);

COMMENT ON TABLE public.event_participation IS
    'Unified Click-account user↔event current-state. Legacy beacon_attendees / event_bookmarks / event_check_ins remain the live write path until a dual-write follow-up. Guest RSVPs stay in event_guest_rsvps.';

COMMENT ON COLUMN public.event_participation.status IS
    'Current status. Backfill never invents interested or no_show.';

ALTER TABLE public.event_participation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_participation_select_own ON public.event_participation;
CREATE POLICY event_participation_select_own
    ON public.event_participation
    FOR SELECT
    TO authenticated
    USING (auth.uid () = user_id);

DROP POLICY IF EXISTS event_participation_insert_own ON public.event_participation;
CREATE POLICY event_participation_insert_own
    ON public.event_participation
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid () = user_id);

DROP POLICY IF EXISTS event_participation_update_own ON public.event_participation;
CREATE POLICY event_participation_update_own
    ON public.event_participation
    FOR UPDATE
    TO authenticated
    USING (auth.uid () = user_id)
    WITH CHECK (auth.uid () = user_id);

DROP POLICY IF EXISTS event_participation_delete_own ON public.event_participation;
CREATE POLICY event_participation_delete_own
    ON public.event_participation
    FOR DELETE
    TO authenticated
    USING (auth.uid () = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_participation TO authenticated;
