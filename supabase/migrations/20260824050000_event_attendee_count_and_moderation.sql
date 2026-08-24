-- P3.2 denormalized attendee_count + P3.4 moderation parity.
-- attendee_count is unused by existing COUNT(*) paths. Trigger maintains the new column only.

-- ---------------------------------------------------------------------------
-- 1. attendee_count cache
-- ---------------------------------------------------------------------------
ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS attendee_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.map_beacons.attendee_count IS
    'Cached count of event_participation rows in rsvpd or checked_in. Optional fast path; unused by current queries. Backfill via scripts/backfill_map_beacon_attendee_count.ts.';

CREATE OR REPLACE FUNCTION public.event_participation_attendee_count ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    old_counts BOOLEAN;
    new_counts BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('rsvpd', 'checked_in') THEN
            UPDATE public.map_beacons
            SET attendee_count = GREATEST(attendee_count - 1, 0)
            WHERE id = OLD.beacon_id;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('rsvpd', 'checked_in') THEN
            UPDATE public.map_beacons
            SET attendee_count = attendee_count + 1
            WHERE id = NEW.beacon_id;
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    old_counts := OLD.status IN ('rsvpd', 'checked_in');
    new_counts := NEW.status IN ('rsvpd', 'checked_in');

    IF OLD.beacon_id IS DISTINCT FROM NEW.beacon_id THEN
        IF old_counts THEN
            UPDATE public.map_beacons
            SET attendee_count = GREATEST(attendee_count - 1, 0)
            WHERE id = OLD.beacon_id;
        END IF;
        IF new_counts THEN
            UPDATE public.map_beacons
            SET attendee_count = attendee_count + 1
            WHERE id = NEW.beacon_id;
        END IF;
        RETURN NEW;
    END IF;

    IF old_counts AND NOT new_counts THEN
        UPDATE public.map_beacons
        SET attendee_count = GREATEST(attendee_count - 1, 0)
        WHERE id = NEW.beacon_id;
    ELSIF new_counts AND NOT old_counts THEN
        UPDATE public.map_beacons
        SET attendee_count = attendee_count + 1
        WHERE id = NEW.beacon_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_participation_attendee_count ON public.event_participation;

CREATE TRIGGER trg_event_participation_attendee_count
    AFTER INSERT OR UPDATE OF status, beacon_id OR DELETE
    ON public.event_participation
    FOR EACH ROW
    EXECUTE FUNCTION public.event_participation_attendee_count ();

-- ---------------------------------------------------------------------------
-- 2. Moderation parity with connections.flagged / connection_reports
-- ---------------------------------------------------------------------------
ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.map_beacons.flagged IS
    'Moderation flag mirroring connections.flagged. Default false; unused until a moderation UI exists.';

CREATE TABLE IF NOT EXISTS public.beacon_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES auth.users (id),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beacon_reports_beacon
    ON public.beacon_reports (beacon_id);

CREATE INDEX IF NOT EXISTS idx_beacon_reports_reporter
    ON public.beacon_reports (reporter_id);

COMMENT ON TABLE public.beacon_reports IS
    'User reports against map beacons. Mirrors connection_reports. Unused until a moderation UI exists.';

ALTER TABLE public.beacon_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beacon_reports_reporter_insert ON public.beacon_reports;
CREATE POLICY beacon_reports_reporter_insert
    ON public.beacon_reports
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid () = reporter_id);

DROP POLICY IF EXISTS beacon_reports_service_select ON public.beacon_reports;
CREATE POLICY beacon_reports_service_select
    ON public.beacon_reports
    FOR SELECT
    USING (auth.role () = 'service_role');

GRANT INSERT ON public.beacon_reports TO authenticated;
GRANT SELECT, INSERT ON public.beacon_reports TO service_role;
