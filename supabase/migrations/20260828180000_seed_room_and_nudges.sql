-- Seed a Room (organizer guest lists + anonymized teasers) and encounter-triggered nudges.
-- Additive only. Organizer guest lists are distinct from unauthenticated event_guest_rsvps.

-- ---------------------------------------------------------------------------
-- Notification prefs
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_preferences
    ADD COLUMN IF NOT EXISTS event_teaser_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS reconnect_nudge_push_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.notification_preferences.event_teaser_push_enabled IS
    'When false, pre-event Seed-a-Room teaser pushes are skipped.';
COMMENT ON COLUMN public.notification_preferences.reconnect_nudge_push_enabled IS
    'When false, reconnect-lull and shared-upcoming-event nudge pushes are skipped.';

-- ---------------------------------------------------------------------------
-- Guest lists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_guest_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('csv', 'manual', 'instagram_import')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    matched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS event_guest_lists_beacon_id_idx
    ON public.event_guest_lists (beacon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS event_guest_lists_organizer_id_idx
    ON public.event_guest_lists (organizer_id);

COMMENT ON TABLE public.event_guest_lists IS
    'Organizer-uploaded attendee lists for pre-event matching. Not guest RSVPs.';

ALTER TABLE public.event_guest_lists ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_guest_lists TO service_role;

CREATE TABLE IF NOT EXISTS public.event_guest_list_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_list_id UUID NOT NULL REFERENCES public.event_guest_lists (id) ON DELETE CASCADE,
    email TEXT,
    instagram_handle TEXT,
    email_hash TEXT,
    matched_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    match_confidence TEXT NOT NULL DEFAULT 'none' CHECK (match_confidence IN ('exact_email', 'none')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT event_guest_list_entries_contact_chk CHECK (
        email IS NOT NULL OR instagram_handle IS NOT NULL
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_guest_list_entries_email_hash_uidx
    ON public.event_guest_list_entries (guest_list_id, email_hash)
    WHERE email_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_guest_list_entries_matched_user_idx
    ON public.event_guest_list_entries (matched_user_id)
    WHERE matched_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_guest_list_entries_guest_list_idx
    ON public.event_guest_list_entries (guest_list_id);

COMMENT ON TABLE public.event_guest_list_entries IS
    'Guest-list rows. Email matching uses SHA-256 hex against user_contact_hashes. Instagram handles stored for future matching.';

ALTER TABLE public.event_guest_list_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_guest_list_entries TO service_role;

-- ---------------------------------------------------------------------------
-- Teasers (anonymized payloads)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_teasers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    teaser_type TEXT NOT NULL CHECK (
        teaser_type IN ('shared_major', 'shared_org', 'shared_interest', 'mutual_connection_count')
    ),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    viewed_at TIMESTAMPTZ,
    push_sent_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS event_teasers_recipient_beacon_uidx
    ON public.event_teasers (beacon_id, recipient_user_id);

CREATE INDEX IF NOT EXISTS event_teasers_push_due_idx
    ON public.event_teasers (beacon_id)
    WHERE push_sent_at IS NULL;

COMMENT ON TABLE public.event_teasers IS
    'One strongest anonymized pre-event teaser per matched Click user per event.';

ALTER TABLE public.event_teasers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_teasers_select_own ON public.event_teasers;
CREATE POLICY event_teasers_select_own
    ON public.event_teasers
    FOR SELECT
    TO authenticated
    USING (auth.uid() = recipient_user_id);

GRANT SELECT ON public.event_teasers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_teasers TO service_role;

-- ---------------------------------------------------------------------------
-- Connection activity + nudges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.connection_activity_summary (
    connection_id UUID PRIMARY KEY REFERENCES public.connections (id) ON DELETE CASCADE,
    last_message_at BIGINT,
    last_encounter_at TIMESTAMPTZ,
    nudge_eligible_at TIMESTAMPTZ,
    last_nudge_sent_at TIMESTAMPTZ,
    nudge_snoozed_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS connection_activity_summary_eligible_idx
    ON public.connection_activity_summary (nudge_eligible_at)
    WHERE nudge_eligible_at IS NOT NULL;

COMMENT ON TABLE public.connection_activity_summary IS
    'Denormalized last-message / last-encounter timestamps for reconnect nudge scans.';

ALTER TABLE public.connection_activity_summary ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_activity_summary TO service_role;

CREATE TABLE IF NOT EXISTS public.nudges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    connection_id UUID REFERENCES public.connections (id) ON DELETE CASCADE,
    beacon_id UUID REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    nudge_type TEXT NOT NULL CHECK (nudge_type IN ('reconnect_lull', 'shared_upcoming_event')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dismissed_at TIMESTAMPTZ,
    acted_on_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS nudges_undismissed_reconnect_uidx
    ON public.nudges (user_id, connection_id)
    WHERE dismissed_at IS NULL AND nudge_type = 'reconnect_lull';

CREATE UNIQUE INDEX IF NOT EXISTS nudges_undismissed_shared_event_uidx
    ON public.nudges (user_id, connection_id, beacon_id)
    WHERE dismissed_at IS NULL AND nudge_type = 'shared_upcoming_event';

CREATE INDEX IF NOT EXISTS nudges_user_active_idx
    ON public.nudges (user_id, sent_at DESC)
    WHERE dismissed_at IS NULL;

COMMENT ON TABLE public.nudges IS
    'Encounter-backed reconnect and shared-upcoming-event prompts. Names allowed only for existing connections.';

ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nudges_select_own ON public.nudges;
CREATE POLICY nudges_select_own
    ON public.nudges
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS nudges_update_own ON public.nudges;
CREATE POLICY nudges_update_own
    ON public.nudges
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT SELECT, UPDATE ON public.nudges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nudges TO service_role;
