-- RSVP granularity: capture the attendee's location + explicit RSVP timestamp.

ALTER TABLE public.beacon_attendees
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS rsvpd_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.beacon_attendees.latitude IS
    'Latitude the attendee was at when they RSVPed (nullable when location was unavailable).';

COMMENT ON COLUMN public.beacon_attendees.longitude IS
    'Longitude the attendee was at when they RSVPed (nullable when location was unavailable).';

COMMENT ON COLUMN public.beacon_attendees.rsvpd_at IS
    'Explicit RSVP timestamp; mirrors created_at on insert but is preserved across upserts.';
