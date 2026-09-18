-- Hub message interaction parity: edit timestamps and dedicated Hub reactions.
-- Mutations remain API/service-role only; authenticated clients receive read-only RLS access.

ALTER TABLE public.hub_messages
    ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Hub message edits/deletes are API/service-role mutations. Keep authenticated
-- clients read-only even if an older environment accumulated broader grants.
REVOKE INSERT, UPDATE, DELETE ON public.hub_messages FROM authenticated;

CREATE TABLE IF NOT EXISTS public.hub_message_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hub_message_id uuid NOT NULL REFERENCES public.hub_messages(id) ON DELETE CASCADE,
    hub_id text NOT NULL REFERENCES public.hub_venues(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction_type text NOT NULL CHECK (char_length(reaction_type) BETWEEN 1 AND 32),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT hub_message_reactions_unique UNIQUE (hub_message_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS hub_message_reactions_hub_idx
    ON public.hub_message_reactions(hub_id);

CREATE INDEX IF NOT EXISTS hub_message_reactions_message_idx
    ON public.hub_message_reactions(hub_message_id);

ALTER TABLE public.hub_message_reactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hub_message_reactions FROM anon;
REVOKE ALL ON public.hub_message_reactions FROM authenticated;
GRANT SELECT ON public.hub_message_reactions TO authenticated;
GRANT ALL ON public.hub_message_reactions TO service_role;

DROP POLICY IF EXISTS "hub_message_reactions_select_authorized" ON public.hub_message_reactions;
CREATE POLICY "hub_message_reactions_select_authorized"
    ON public.hub_message_reactions
    FOR SELECT
    TO authenticated
    USING (public.auth_uid_in_hub(hub_id));

ALTER TABLE public.hub_message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'hub_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hub_message_reactions;
  END IF;
END $$;

COMMENT ON COLUMN public.hub_messages.edited_at IS
    'Server-controlled timestamp for the most recent Hub message edit.';

COMMENT ON TABLE public.hub_message_reactions IS
    'Per-message Hub reactions. Writes are restricted to the Hub interaction API.';
