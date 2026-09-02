-- Production containment for the event-hub rollout.
--
-- This migration follows 20260901200000, which intentionally mirrors the mobile
-- repository but redefines the legacy arbitrary-creator RPC. Keep that signature
-- service-role-only and provide caller-scoped product access below.

ALTER TABLE public.hub_venues
    ADD COLUMN IF NOT EXISTS event_beacon_id uuid;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS hub_id text;

CREATE INDEX IF NOT EXISTS hub_venues_event_beacon_id_idx
    ON public.hub_venues (event_beacon_id);

CREATE INDEX IF NOT EXISTS map_beacons_hub_id_idx
    ON public.map_beacons (hub_id);

-- Remove orphaned canonical links before validating the relationship. This also
-- makes the migration safe for an upgrade where an earlier foreign key was
-- absent or had been disabled during a partial deployment.
UPDATE public.hub_venues AS hub
SET event_beacon_id = NULL
WHERE hub.event_beacon_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.map_beacons AS beacon WHERE beacon.id = hub.event_beacon_id
  );

-- Clear only orphaned denormalized links. hub_venues.event_beacon_id is the
-- canonical relationship; map_beacons.hub_id is a synchronized compatibility field.
UPDATE public.map_beacons AS beacon
SET hub_id = NULL
WHERE beacon.hub_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.hub_venues AS hub WHERE hub.id = beacon.hub_id
  );

-- When a divergent history allowed more than one hub to point at an event,
-- retain the hub already named by map_beacons.hub_id. Otherwise choose a stable
-- hub id. The discarded hubs remain standalone rather than being deleted.
WITH ranked_links AS (
    SELECT
        hub.id,
        hub.event_beacon_id,
        row_number() OVER (
            PARTITION BY hub.event_beacon_id
            ORDER BY
                CASE WHEN beacon.hub_id = hub.id THEN 0 ELSE 1 END,
                hub.id
        ) AS link_rank
    FROM public.hub_venues AS hub
    LEFT JOIN public.map_beacons AS beacon ON beacon.id = hub.event_beacon_id
    WHERE hub.event_beacon_id IS NOT NULL
)
UPDATE public.hub_venues AS hub
SET event_beacon_id = NULL
FROM ranked_links AS ranked
WHERE ranked.id = hub.id
  AND ranked.link_rank > 1;

-- Preserve a valid old map_beacons.hub_id link only when its canonical column
-- has not been populated and it cannot conflict with another event hub.
UPDATE public.hub_venues AS hub
SET event_beacon_id = beacon.id
FROM public.map_beacons AS beacon
WHERE beacon.hub_id = hub.id
  AND hub.event_beacon_id IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.hub_venues AS other_hub
      WHERE other_hub.event_beacon_id = beacon.id
        AND other_hub.id <> hub.id
  );

-- Rebuild the denormalized column from the canonical relationship.
UPDATE public.map_beacons AS beacon
SET hub_id = hub.id
FROM public.hub_venues AS hub
WHERE hub.event_beacon_id = beacon.id
  AND beacon.hub_id IS DISTINCT FROM hub.id;

-- A noncanonical compatibility link is stale even if it references a real hub.
UPDATE public.map_beacons AS beacon
SET hub_id = NULL
WHERE beacon.hub_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.hub_venues AS hub
      WHERE hub.id = beacon.hub_id
        AND hub.event_beacon_id = beacon.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS hub_venues_event_beacon_id_unique_idx
    ON public.hub_venues (event_beacon_id)
    WHERE event_beacon_id IS NOT NULL;

-- Validate the required delete behavior even if a divergent deployment created
-- the columns without their foreign keys. Avoid duplicating an equivalent key
-- that already exists under PostgreSQL's generated constraint name.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'public.hub_venues'::regclass
          AND constraint_row.contype = 'f'
          AND constraint_row.confrelid = 'public.map_beacons'::regclass
          AND constraint_row.confdeltype = 'c'
          AND constraint_row.conkey = ARRAY[
              (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'public.hub_venues'::regclass AND attname = 'event_beacon_id')
          ]::smallint[]
    ) THEN
        ALTER TABLE public.hub_venues
            DROP CONSTRAINT IF EXISTS hub_venues_event_beacon_id_fkey;
        ALTER TABLE public.hub_venues
            ADD CONSTRAINT hub_venues_event_beacon_id_fkey
            FOREIGN KEY (event_beacon_id)
            REFERENCES public.map_beacons (id)
            ON DELETE CASCADE
            NOT VALID;
        ALTER TABLE public.hub_venues
            VALIDATE CONSTRAINT hub_venues_event_beacon_id_fkey;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'public.map_beacons'::regclass
          AND constraint_row.contype = 'f'
          AND constraint_row.confrelid = 'public.hub_venues'::regclass
          AND constraint_row.confdeltype = 'n'
          AND constraint_row.conkey = ARRAY[
              (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'public.map_beacons'::regclass AND attname = 'hub_id')
          ]::smallint[]
    ) THEN
        ALTER TABLE public.map_beacons
            DROP CONSTRAINT IF EXISTS map_beacons_hub_id_fkey;
        ALTER TABLE public.map_beacons
            ADD CONSTRAINT map_beacons_hub_id_fkey
            FOREIGN KEY (hub_id)
            REFERENCES public.hub_venues (id)
            ON DELETE SET NULL
            NOT VALID;
        ALTER TABLE public.map_beacons
            VALIDATE CONSTRAINT map_beacons_hub_id_fkey;
    END IF;
END;
$$;

COMMENT ON COLUMN public.hub_venues.event_beacon_id IS
    'Canonical event-hub relationship. Event deletion cascades to the owned hub.';

COMMENT ON COLUMN public.map_beacons.hub_id IS
    'Synchronized event-hub compatibility link. Cleared when the linked hub is deleted.';

CREATE OR REPLACE FUNCTION public.sync_event_hub_beacon_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.event_beacon_id IS NOT DISTINCT FROM OLD.event_beacon_id THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.event_beacon_id IS NOT NULL THEN
        UPDATE public.map_beacons
        SET hub_id = NULL
        WHERE id = OLD.event_beacon_id
          AND hub_id = OLD.id;
    END IF;

    IF NEW.event_beacon_id IS NOT NULL THEN
        UPDATE public.map_beacons
        SET hub_id = NEW.id
        WHERE id = NEW.event_beacon_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_event_hub_beacon_link_after_write ON public.hub_venues;
CREATE TRIGGER sync_event_hub_beacon_link_after_write
AFTER INSERT OR UPDATE OF event_beacon_id ON public.hub_venues
FOR EACH ROW EXECUTE FUNCTION public.sync_event_hub_beacon_link();

REVOKE ALL ON FUNCTION public.sync_event_hub_beacon_link() FROM PUBLIC;

-- RLS is the final authority for direct Supabase reads, inserts, and Realtime.
-- A stale event-hub participant row is never sufficient after check-out.
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
                  )
              )
          )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_uid_in_hub(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_uid_in_hub(text) TO authenticated;

COMMENT ON FUNCTION public.auth_uid_in_hub(text) IS
    'Authoritative hub access: current standalone membership, or event host/active check-in, with expiry enforcement.';

DROP POLICY IF EXISTS "hub_messages_select_authenticated" ON public.hub_messages;
DROP POLICY IF EXISTS "hub_messages_select_participants" ON public.hub_messages;
CREATE POLICY "hub_messages_select_authorized"
    ON public.hub_messages
    FOR SELECT
    TO authenticated
    USING (public.auth_uid_in_hub(hub_id));

DROP POLICY IF EXISTS "hub_messages_insert_authenticated" ON public.hub_messages;
DROP POLICY IF EXISTS "hub_messages_insert_authorized" ON public.hub_messages;
CREATE POLICY "hub_messages_insert_authorized"
    ON public.hub_messages
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id AND public.auth_uid_in_hub(hub_id));

-- Preserve the existing discovery audience rules while projecting only the
-- canonical hub relationship.
CREATE OR REPLACE FUNCTION public.fetch_map_beacons_within (
    lat double precision,
    lng double precision,
    radius_meters double precision DEFAULT 5000,
    p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
    FROM (
        SELECT
            jsonb_build_object(
                'id', beacon.id,
                'creator_id', beacon.creator_id,
                'venue_id', beacon.venue_id,
                'hub_id', hub.id,
                'beacon_type', beacon.beacon_type,
                'show_creator_name', beacon.show_creator_name,
                'visibility_audience', beacon.visibility_audience,
                'lng', ST_X(beacon.location::geometry),
                'lat', ST_Y(beacon.location::geometry),
                'metadata', beacon.metadata,
                'created_at', beacon.created_at,
                'expires_at', beacon.expires_at
            ) AS row_data,
            beacon.created_at
        FROM public.map_beacons AS beacon
        LEFT JOIN public.hub_venues AS hub ON hub.event_beacon_id = beacon.id
        WHERE beacon.expires_at > now()
          AND ST_DWithin(
              beacon.location,
              ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
              radius_meters
          )
          AND (
              beacon.creator_id = auth.uid()
              OR beacon.visibility_audience = 'everyone'::public.beacon_visibility_audience
              OR (
                  beacon.visibility_audience = 'connections'::public.beacon_visibility_audience
                  AND public.auth_uid_beacon_can_see_creator(beacon.creator_id)
              )
              OR (
                  beacon.visibility_audience = 'core_connections'::public.beacon_visibility_audience
                  AND public.auth_uid_core_peer_of_creator(beacon.creator_id)
              )
          )
        ORDER BY beacon.created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
    ) AS visible_beacons;
$$;

REVOKE ALL ON FUNCTION public.fetch_map_beacons_within(double precision, double precision, double precision, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within(double precision, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within(double precision, double precision, double precision, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fetch_my_active_map_beacons (
    p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        jsonb_agg(row_data ORDER BY created_at DESC),
        '[]'::jsonb
    )
    FROM (
        SELECT
            jsonb_build_object(
                'id', beacon.id,
                'creator_id', beacon.creator_id,
                'venue_id', beacon.venue_id,
                'hub_id', hub.id,
                'beacon_type', beacon.beacon_type,
                'show_creator_name', beacon.show_creator_name,
                'visibility_audience', beacon.visibility_audience,
                'lng', ST_X(beacon.location::geometry),
                'lat', ST_Y(beacon.location::geometry),
                'metadata', beacon.metadata,
                'created_at', beacon.created_at,
                'expires_at', beacon.expires_at
            ) AS row_data,
            beacon.created_at
        FROM public.map_beacons AS beacon
        LEFT JOIN public.hub_venues AS hub ON hub.event_beacon_id = beacon.id
        WHERE beacon.creator_id = auth.uid()
          AND beacon.expires_at > now()
        ORDER BY beacon.created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    ) AS active_beacons;
$$;

REVOKE ALL ON FUNCTION public.fetch_my_active_map_beacons(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_my_active_map_beacons(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_active_map_beacons(integer) TO service_role;

-- Retain the legacy maintenance signature for service-role callers only, but
-- make its relationship projection canonical as well.
CREATE OR REPLACE FUNCTION public.fetch_creator_active_map_beacons (
    p_creator_id uuid,
    p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
    FROM (
        SELECT
            jsonb_build_object(
                'id', beacon.id,
                'creator_id', beacon.creator_id,
                'venue_id', beacon.venue_id,
                'hub_id', hub.id,
                'beacon_type', beacon.beacon_type,
                'show_creator_name', beacon.show_creator_name,
                'visibility_audience', beacon.visibility_audience,
                'lng', ST_X(beacon.location::geometry),
                'lat', ST_Y(beacon.location::geometry),
                'metadata', beacon.metadata,
                'created_at', beacon.created_at,
                'expires_at', beacon.expires_at
            ) AS row_data,
            beacon.created_at
        FROM public.map_beacons AS beacon
        LEFT JOIN public.hub_venues AS hub ON hub.event_beacon_id = beacon.id
        WHERE beacon.creator_id = p_creator_id
          AND beacon.expires_at > now()
        ORDER BY beacon.created_at DESC
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    ) AS active_beacons;
$$;

REVOKE ALL ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.fetch_my_active_map_beacons(integer) IS
    'Caller-scoped active map beacons with lat/lng. Uses auth.uid(); authenticated callers cannot select another creator.';

COMMENT ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) IS
    'Service-role-only maintenance RPC. Product clients must use fetch_my_active_map_beacons.';

-- New hub uploads use a private bucket. Legacy chat-media stays in place for
-- deployed direct-upload clients; migrating it requires a coordinated client release.
INSERT INTO storage.buckets (id, name, public)
VALUES ('hub-media', 'hub-media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

COMMENT ON TABLE public.hub_venues IS
    'Community hubs. event_beacon_id is the canonical event-hub relationship; map_beacons.hub_id is a synchronized compatibility field.';
