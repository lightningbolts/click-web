-- Ephemeral hub metadata, participant registry, and public-safe profile colors.

ALTER TABLE public.hub_venues
    ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

ALTER TABLE public.hub_venues
    ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.hub_venues
    ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hub_venues.category IS 'Hub segment label (server-assigned from create payload).';

COMMENT ON COLUMN public.hub_venues.expires_at IS 'When the hub stops accepting geofenced traffic; set at creation (now + 24h).';

UPDATE public.hub_venues
SET
    expires_at = created_at + interval '24 hours'
WHERE
    expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hub_venues_expires_at ON public.hub_venues (expires_at);

CREATE TABLE IF NOT EXISTS public.hub_participants (
    hub_id text NOT NULL REFERENCES public.hub_venues (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (hub_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_participants_user_id ON public.hub_participants (user_id);

COMMENT ON TABLE public.hub_participants IS 'Hub membership rows; maintained by trusted API (service role).';

ALTER TABLE public.hub_participants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hub_participants FROM anon;

REVOKE ALL ON public.hub_participants FROM authenticated;

GRANT ALL ON public.hub_participants TO service_role;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS aura_colors text[] DEFAULT ARRAY['#6366f1', '#a855f7', '#ec4899']::text[];

COMMENT ON COLUMN public.users.aura_colors IS 'Public palette for share / App Clip previews (no PII).';
