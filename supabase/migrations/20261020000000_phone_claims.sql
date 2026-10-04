-- Unverified phone numbers for Find friends (no SMS yet): limit how often an account can change
-- its number, and let the real owner report a number someone else claimed.

-- Append-only log of numbers saved via PUT /api/me/phone; enforces 3 changes per user per 24h.
CREATE TABLE IF NOT EXISTS public.user_phone_changes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_phone_changes_user_day
    ON public.user_phone_changes (user_id, created_at);

ALTER TABLE public.user_phone_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_phone_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_phone_changes TO service_role;

-- "That's my number": the reporter tried to save a number another account holds. Stores the
-- hash and the current holder, never the plaintext number. Reviewed by hand; resolving one
-- means clearing the holder's users.phone_e164.
CREATE TABLE IF NOT EXISTS public.phone_claim_reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_hash   TEXT NOT NULL CHECK (phone_hash ~ '^[a-f0-9]{64}$'),
    holder_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    reporter_id  UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at  TIMESTAMPTZ,
    UNIQUE (phone_hash, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_phone_claim_reports_open
    ON public.phone_claim_reports (created_at) WHERE resolved_at IS NULL;

ALTER TABLE public.phone_claim_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_claim_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_claim_reports TO service_role;
