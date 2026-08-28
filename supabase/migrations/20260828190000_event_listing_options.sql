-- Event listing / RSVP options. Separate from map pin visibility_audience.
-- Additive only. Existing rows default to a public listed event with unlimited capacity.

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS event_visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS event_capacity INTEGER NULL;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS guest_list_visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS cover_theme_id TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'map_beacons_event_visibility_chk'
    ) THEN
        ALTER TABLE public.map_beacons
            ADD CONSTRAINT map_beacons_event_visibility_chk
            CHECK (event_visibility IN ('public', 'unlisted', 'invite_only'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'map_beacons_event_capacity_chk'
    ) THEN
        ALTER TABLE public.map_beacons
            ADD CONSTRAINT map_beacons_event_capacity_chk
            CHECK (event_capacity IS NULL OR event_capacity > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'map_beacons_guest_list_visibility_chk'
    ) THEN
        ALTER TABLE public.map_beacons
            ADD CONSTRAINT map_beacons_guest_list_visibility_chk
            CHECK (guest_list_visibility IN ('public', 'hosts_only'));
    END IF;
END $$;

COMMENT ON COLUMN public.map_beacons.event_visibility IS
    'Public listing and RSVP policy: public (on /events), unlisted (link only), invite_only.';

COMMENT ON COLUMN public.map_beacons.event_capacity IS
    'Optional max confirmed RSVPs. NULL means unlimited.';

COMMENT ON COLUMN public.map_beacons.approval_required IS
    'When true, Click RSVPs write event_rsvp_requests as pending instead of beacon_attendees.';

COMMENT ON COLUMN public.map_beacons.guest_list_visibility IS
    'Whether attendee avatars are shown on the public event page.';

COMMENT ON COLUMN public.map_beacons.cover_theme_id IS
    'Optional CardVisual seed override. NULL uses the beacon id.';

CREATE INDEX IF NOT EXISTS idx_map_beacons_public_events
    ON public.map_beacons (event_visibility, beacon_type)
    WHERE event_visibility = 'public' AND beacon_type = 'event';

CREATE TABLE IF NOT EXISTS public.event_rsvp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'waitlisted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (beacon_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_rsvp_requests_beacon_status_idx
    ON public.event_rsvp_requests (beacon_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS event_rsvp_requests_user_idx
    ON public.event_rsvp_requests (user_id);

COMMENT ON TABLE public.event_rsvp_requests IS
    'Click-account RSVP requests for approval-required or at-capacity events. Guests stay in event_guest_rsvps.';

ALTER TABLE public.event_rsvp_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_rsvp_requests TO service_role;
