-- Repair active event beacons created before automatic event-hub provisioning,
-- then align database/RLS authorization with the server gatekeeper: event hosts,
-- active check-ins, and current RSVPs may read/write the event hub until expiry.

WITH candidates AS (
    SELECT
        mb.id AS beacon_id,
        mb.creator_id,
        COALESCE(
            NULLIF(btrim(mb.metadata->>'title'), ''),
            NULLIF(btrim(mb.metadata->>'event_title'), ''),
            NULLIF(btrim(mb.metadata->>'name'), ''),
            NULLIF(btrim(mb.metadata->>'label'), ''),
            'Event'
        ) AS event_name,
        ST_Y(mb.location::geometry) AS geofence_lat,
        ST_X(mb.location::geometry) AS geofence_long,
        CASE
            WHEN COALESCE(mb.metadata->>'check_in_radius_meters', mb.metadata->>'checkInRadiusMeters') ~ '^[0-9]+(\.[0-9]+)?$'
                THEN LEAST(
                    5000,
                    GREATEST(
                        25,
                        COALESCE(mb.metadata->>'check_in_radius_meters', mb.metadata->>'checkInRadiusMeters')::numeric
                    )
                )::integer
            WHEN COALESCE(mb.metadata->>'venue_scale', mb.metadata->>'venueScale') = 'intimate' THEN 75
            WHEN COALESCE(mb.metadata->>'venue_scale', mb.metadata->>'venueScale') = 'venue' THEN 750
            WHEN COALESCE(mb.metadata->>'venue_scale', mb.metadata->>'venueScale') = 'campus' THEN 2500
            ELSE 250
        END AS radius_meters,
        CASE
            WHEN COALESCE(mb.ends_at, mb.expires_at) IS NULL THEN NULL
            ELSE COALESCE(mb.ends_at, mb.expires_at) + interval '24 hours'
        END AS hub_expires_at
    FROM public.map_beacons AS mb
    WHERE mb.beacon_type = 'event'
      AND mb.creator_id IS NOT NULL
      AND mb.location IS NOT NULL
      AND (
          COALESCE(mb.ends_at, mb.expires_at) IS NULL
          OR COALESCE(mb.ends_at, mb.expires_at) > now()
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.hub_venues AS hv
          WHERE hv.event_beacon_id = mb.id
      )
)
INSERT INTO public.hub_venues (
    id,
    name,
    category,
    geofence_lat,
    geofence_long,
    radius_meters,
    expires_at,
    creator_id,
    event_beacon_id
)
SELECT
    'hub_' || replace(gen_random_uuid()::text, '-', ''),
    left(event_name, 80),
    'event',
    geofence_lat,
    geofence_long,
    radius_meters,
    hub_expires_at,
    creator_id,
    beacon_id
FROM candidates;

UPDATE public.map_beacons AS mb
SET
    hub_id = hv.id,
    metadata = jsonb_set(COALESCE(mb.metadata, '{}'::jsonb), '{hub_id}', to_jsonb(hv.id), true)
FROM public.hub_venues AS hv
WHERE hv.event_beacon_id = mb.id
  AND (
      mb.hub_id IS DISTINCT FROM hv.id
      OR COALESCE(mb.metadata->>'hub_id', '') IS DISTINCT FROM hv.id
  );

INSERT INTO public.hub_participants (hub_id, user_id)
SELECT hv.id, mb.creator_id
FROM public.hub_venues AS hv
JOIN public.map_beacons AS mb ON mb.id = hv.event_beacon_id
WHERE mb.creator_id IS NOT NULL
ON CONFLICT (hub_id, user_id) DO NOTHING;

INSERT INTO public.hub_participants (hub_id, user_id)
SELECT hv.id, ba.user_id
FROM public.hub_venues AS hv
JOIN public.beacon_attendees AS ba ON ba.beacon_id = hv.event_beacon_id
WHERE ba.user_id IS NOT NULL
ON CONFLICT (hub_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.auth_uid_in_hub(p_hub_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.hub_venues AS hub
        LEFT JOIN public.map_beacons AS beacon ON beacon.id = hub.event_beacon_id
        WHERE hub.id = p_hub_id
          AND (hub.expires_at IS NULL OR hub.expires_at > now())
          AND (
              (
                  hub.event_beacon_id IS NULL
                  AND EXISTS (
                      SELECT 1
                      FROM public.hub_participants AS participant
                      WHERE participant.hub_id = hub.id
                        AND participant.user_id = auth.uid()
                  )
              )
              OR (
                  hub.event_beacon_id IS NOT NULL
                  AND (
                      hub.creator_id = auth.uid()
                      OR beacon.creator_id = auth.uid()
                      OR EXISTS (
                          SELECT 1
                          FROM public.event_check_ins AS check_in
                          WHERE check_in.beacon_id = hub.event_beacon_id
                            AND check_in.user_id = auth.uid()
                            AND check_in.checked_out_at IS NULL
                      )
                      OR EXISTS (
                          SELECT 1
                          FROM public.beacon_attendees AS attendee
                          WHERE attendee.beacon_id = hub.event_beacon_id
                            AND attendee.user_id = auth.uid()
                      )
                  )
              )
          )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_uid_in_hub(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_uid_in_hub(text) TO authenticated;

COMMENT ON FUNCTION public.auth_uid_in_hub(text) IS
    'Authoritative hub access: standalone participant membership, or event host/active check-in/current RSVP, with expiry enforcement.';
