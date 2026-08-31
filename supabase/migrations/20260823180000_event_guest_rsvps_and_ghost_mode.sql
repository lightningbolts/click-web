-- Guest (no-account) event RSVPs + persisted ghost mode for mutual-attendee privacy.

CREATE TABLE IF NOT EXISTS public.event_guest_rsvps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_guest_rsvps_beacon_contact_uidx
    ON public.event_guest_rsvps (beacon_id, lower(contact));

CREATE INDEX IF NOT EXISTS event_guest_rsvps_beacon_id_idx
    ON public.event_guest_rsvps (beacon_id, created_at DESC);

COMMENT ON TABLE public.event_guest_rsvps IS
    'Unauthenticated name+contact RSVPs for public event microsites. Not joinable to Click accounts.';

ALTER TABLE public.event_guest_rsvps ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.event_guest_rsvps TO service_role;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.ghost_mode IS
    'When true, the user is excluded from other people''s "connections attending" overlap.';
