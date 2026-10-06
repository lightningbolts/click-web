-- Click for Business, Team (spec §9.5 / phase 5b): owners invite people to manage a Place by email.
-- Additive and idempotent. Written only by click-web with the service role, so RLS is on with no
-- policies and clients have no grants: an invite token never reaches another account.

CREATE TABLE IF NOT EXISTS public.place_manager_invites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id     UUID NOT NULL REFERENCES public.places (id) ON DELETE CASCADE,
    email        TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
    role         TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'viewer')),
    invited_by   UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    -- SHA-256 of the emailed token; the token itself is never stored.
    token_hash   TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
    accepted_at  TIMESTAMPTZ,
    accepted_by  UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    revoked_at   TIMESTAMPTZ
);

COMMENT ON TABLE public.place_manager_invites IS
    'Pending and past invitations to manage a Place. Service role only; accept via POST /api/places/invites/{token}/accept.';

-- Lookups: by token on accept, by Place on the Team tab (FK index), one open invite per address.
CREATE UNIQUE INDEX IF NOT EXISTS place_manager_invites_token_hash_key
    ON public.place_manager_invites (token_hash);
CREATE INDEX IF NOT EXISTS idx_place_manager_invites_place
    ON public.place_manager_invites (place_id);
CREATE UNIQUE INDEX IF NOT EXISTS place_manager_invites_open_email_key
    ON public.place_manager_invites (place_id, lower(email))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.place_manager_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_manager_invites FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
