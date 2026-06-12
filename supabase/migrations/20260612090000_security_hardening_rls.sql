-- Security hardening (2026-06-12 audit):
--   1. hub_messages: scope SELECT to hub participants (was USING (true) — any
--      authenticated user could read every hub's chat).
--   2. proximity_handshake_events: enable RLS, service-role only, and add a
--      (user_id, created_at) index for the bind-proximity-connection hot path.
--   3. beacon_attendees: scope SELECT to own rows (attendee lists are served by
--      the service-role API at /api/beacons/[beaconId]/rsvp).
--   4. waitlist: remove the blanket authenticated SELECT (admin dashboard reads
--      via service role).
--   5. Partial indexes for the expire-connections sweep queries.

-- ─── 1. hub_messages participant-scoped reads ────────────────────────────────
-- hub_participants is service-role-only (REVOKEd from authenticated), so the
-- policy must go through a SECURITY DEFINER helper — same pattern as
-- auth_uid_in_group (20260410190000).
--
-- Participant rows are written by trusted surfaces: hub create, the
-- verify-hub-proximity Edge Function (on successful geofence verification), and
-- POST /api/hub/messages. Leaving a hub deletes the row and revokes read access.

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
        FROM public.hub_participants hp
        WHERE hp.hub_id = p_hub_id
          AND hp.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.auth_uid_in_hub(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_uid_in_hub(text) TO authenticated;

COMMENT ON FUNCTION public.auth_uid_in_hub(text) IS
    'True when auth.uid() is a registered participant of p_hub_id; used by hub_messages RLS.';

DROP POLICY IF EXISTS "hub_messages_select_authenticated" ON public.hub_messages;
CREATE POLICY "hub_messages_select_participants"
    ON public.hub_messages FOR SELECT
    TO authenticated
    USING (public.auth_uid_in_hub(hub_id));

-- Inserts stay locked to the author; geofence enforcement happens in the
-- trusted API (/api/hub/messages) which writes via service role.

-- ─── 2. proximity_handshake_events: RLS + hot-path index ────────────────────
-- Rows are written and matched exclusively by the bind-proximity-connection
-- Edge Function (service role). Clients must never read raw handshake pings.

ALTER TABLE public.proximity_handshake_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.proximity_handshake_events FROM anon;
REVOKE ALL ON public.proximity_handshake_events FROM authenticated;

CREATE INDEX IF NOT EXISTS proximity_handshake_events_user_created_idx
    ON public.proximity_handshake_events (user_id, created_at DESC);

-- ─── 3. beacon_attendees: own-row reads only ─────────────────────────────────

DROP POLICY IF EXISTS "beacon_attendees_select_authenticated" ON public.beacon_attendees;
CREATE POLICY "beacon_attendees_select_own"
    ON public.beacon_attendees
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- ─── 4. waitlist: service-role reads only ────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can view waitlist" ON public.waitlist;
REVOKE SELECT ON public.waitlist FROM authenticated;

-- ─── 5. expire-connections sweep indexes ─────────────────────────────────────
-- Sweep queries filter on (status, created) for pending rows with no messages
-- and (status, last_message_at) for idle-active rows.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'connections'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_connections_expire_pending
            ON public.connections (status, created)
            WHERE last_message_at IS NULL;

        CREATE INDEX IF NOT EXISTS idx_connections_expire_idle
            ON public.connections (status, last_message_at);
    END IF;
END $$;
