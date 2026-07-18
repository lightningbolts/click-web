-- RSVP-gated map event linking on connection encounters.
-- When both parties RSVPed and connect inside a live event geofence,
-- persist event_beacon_id (+ denorm) and merge context tag `at_event` (server-side).

ALTER TABLE public.connection_encounters
  ADD COLUMN IF NOT EXISTS event_beacon_id uuid REFERENCES public.map_beacons (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_beacon_title text,
  ADD COLUMN IF NOT EXISTS event_beacon_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_beacon_end_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_connection_encounters_event_beacon_id
  ON public.connection_encounters (event_beacon_id)
  WHERE event_beacon_id IS NOT NULL;

COMMENT ON COLUMN public.connection_encounters.event_beacon_id IS
  'Map event beacon (user-dropped) when both parties RSVPed and connected at live place/time; distinct from events_registry event_id.';
COMMENT ON COLUMN public.connection_encounters.event_beacon_title IS
  'Denormalized event title at encounter write time.';
COMMENT ON COLUMN public.connection_encounters.event_beacon_start_at IS
  'Denormalized event start at encounter write time.';
COMMENT ON COLUMN public.connection_encounters.event_beacon_end_at IS
  'Denormalized event end at encounter write time.';
