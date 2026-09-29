-- F3: Shared Click Drops — one drop to all your connections or your core connections, developing
-- 24 hours after it's posted (rolling), like chat drops.
--
-- Multi-recipient, so not end-to-end encrypted like chats: media sits in the private click-drops
-- bucket (shared/{user}/…) behind server access checks; the original is signed only after reveal.
-- The audience is resolved at read time from both people's current connection state, so
-- archiving, hiding, un-coring or blocking takes effect immediately. Additive only; ships dark.

INSERT INTO public.feature_flags (key, description, config)
VALUES (
    'shared_drops',
    'Shared Click Drops to connections, Home strip (spec F3).',
    '{"daily_cap": 3, "develop_hours": 24, "teaser": "pixelated", "strip_days": 7, "strip_limit": 12}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.shared_drops (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    audience       TEXT NOT NULL CHECK (audience IN ('all', 'core')),
    client_drop_id UUID NOT NULL,
    original_path  TEXT NOT NULL UNIQUE,
    preview_path   TEXT NOT NULL UNIQUE,
    width          INTEGER CHECK (width IS NULL OR width > 0),
    height         INTEGER CHECK (height IS NULL OR height > 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reveal_at      TIMESTAMPTZ NOT NULL,
    deleted_at     TIMESTAMPTZ,
    UNIQUE (user_id, client_drop_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_drops_user_recent
    ON public.shared_drops (user_id, created_at DESC)
    WHERE deleted_at IS NULL;

ALTER TABLE public.shared_drops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_drops FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.shared_drops IS
    'Shared Click Drops (server only; /api/me/shared-drops). Soft-deleted rows have their media removed.';

-- Daily cap per poster (rolling 24 h; deleted drops still count, so delete-and-repost can't
-- bypass it), enforced under a lock so concurrent posts can't exceed it.
CREATE OR REPLACE FUNCTION public.enforce_shared_drop_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    cap INTEGER;
BEGIN
    SELECT COALESCE((config ->> 'daily_cap')::int, 3) INTO cap
    FROM public.feature_flags WHERE key = 'shared_drops';
    cap := COALESCE(cap, 3);
    PERFORM pg_advisory_xact_lock(hashtextextended('shared_drops:' || NEW.user_id::text, 0));
    IF (SELECT count(*) FROM public.shared_drops
        WHERE user_id = NEW.user_id AND created_at > now() - interval '24 hours') >= cap THEN
        RAISE EXCEPTION 'shared drop daily cap reached' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_drops_cap ON public.shared_drops;
CREATE TRIGGER trg_shared_drops_cap
    BEFORE INSERT ON public.shared_drops
    FOR EACH ROW EXECUTE FUNCTION public.enforce_shared_drop_cap();
