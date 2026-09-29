-- F1: Event Click Drops + next-morning recap. F2: event history.
--
-- Checked-in attendees post up to N drops (default 10) from event start until local midnight at the
-- end of the event; every drop for an event reveals together at 10:00 local the next morning.
-- Media lives in the private click-drops bucket (event/{beacon}/{user}/…): a pixelated preview
-- anyone allowed may see, and the original, signed only after reveal via /api/drops/develop.
-- Additive only; both features ship dark.

INSERT INTO public.feature_flags (key, description, config)
VALUES
    (
        'event_drops',
        'Event Click Drops and the next-morning recap (spec F1).',
        '{"per_user_cap": 10, "reveal_hour_local": 10, "absentee_limit": 6}'::jsonb
    ),
    (
        'event_history',
        'Past events history and the Home recap card (spec F2).',
        '{"recap_card_hours": 48}'::jsonb
    )
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.event_drops (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beacon_id         UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    -- Retries of one upload resolve to the same drop.
    client_drop_id    UUID NOT NULL,
    original_path     TEXT NOT NULL UNIQUE,
    preview_path      TEXT NOT NULL UNIQUE,
    width             INTEGER CHECK (width IS NULL OR width > 0),
    height            INTEGER CHECK (height IS NULL OR height > 0),
    -- Picks the recap filter; the same on every device. Originals are never modified.
    filter_seed       INTEGER NOT NULL,
    show_to_absentees BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    reveal_at         TIMESTAMPTZ NOT NULL,
    deleted_at        TIMESTAMPTZ,
    UNIQUE (user_id, client_drop_id)
);

CREATE INDEX IF NOT EXISTS idx_event_drops_beacon
    ON public.event_drops (beacon_id, created_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_event_drops_user
    ON public.event_drops (user_id);

ALTER TABLE public.event_drops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_drops FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.event_drops IS
    'Event Click Drops (server only; /api/beacons/{id}/drops). Soft-deleted rows have their media removed.';

-- The per-poster cap, enforced under a lock so concurrent uploads can't exceed it.
CREATE OR REPLACE FUNCTION public.enforce_event_drop_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    cap INTEGER;
BEGIN
    SELECT COALESCE((config ->> 'per_user_cap')::int, 10) INTO cap
    FROM public.feature_flags WHERE key = 'event_drops';
    cap := COALESCE(cap, 10);
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.beacon_id::text || ':' || NEW.user_id::text, 0));
    IF (SELECT count(*) FROM public.event_drops
        WHERE beacon_id = NEW.beacon_id AND user_id = NEW.user_id AND deleted_at IS NULL) >= cap THEN
        RAISE EXCEPTION 'event drop cap reached' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_drops_cap ON public.event_drops;
CREATE TRIGGER trg_event_drops_cap
    BEFORE INSERT ON public.event_drops
    FOR EACH ROW EXECUTE FUNCTION public.enforce_event_drop_cap();

-- One recap per event: when it reveals and whether its "recap is ready" push went out.
CREATE TABLE IF NOT EXISTS public.event_drop_recaps (
    beacon_id   UUID PRIMARY KEY REFERENCES public.map_beacons (id) ON DELETE CASCADE,
    reveal_at   TIMESTAMPTZ NOT NULL,
    notified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_drop_recaps_due
    ON public.event_drop_recaps (reveal_at)
    WHERE notified_at IS NULL;

ALTER TABLE public.event_drop_recaps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_drop_recaps FROM PUBLIC, anon, authenticated;

-- Quiet reports on any Click Drop kind (moderation; never shown to anyone).
CREATE TABLE IF NOT EXISTS public.drop_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_kind   TEXT NOT NULL CHECK (drop_kind IN ('chat', 'event', 'shared')),
    drop_id     UUID NOT NULL,
    reporter_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    reason      TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drop_reports_drop ON public.drop_reports (drop_kind, drop_id);

ALTER TABLE public.drop_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drop_reports FROM PUBLIC, anon, authenticated;
