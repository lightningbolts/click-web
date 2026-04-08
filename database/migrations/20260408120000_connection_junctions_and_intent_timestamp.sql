-- Relational archive/hide for connections + profile intent refresh timestamp
-- Idempotent where possible.
-- Canonical mirror: supabase/migrations/20260408120000_connection_junctions_and_intent_timestamp.sql

-- ─── connection_archives (per-user archive of a shared connection row) ─────

CREATE TABLE IF NOT EXISTS public.connection_archives (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES public.connections (id) ON DELETE CASCADE,
    archived_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_archives_user_id
    ON public.connection_archives (user_id);

CREATE INDEX IF NOT EXISTS idx_connection_archives_connection_id
    ON public.connection_archives (connection_id);

ALTER TABLE public.connection_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connection_archives_own_all" ON public.connection_archives;
CREATE POLICY "connection_archives_own_all"
    ON public.connection_archives
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_archives TO authenticated;

-- ─── connection_hidden (per-user soft delete / hide) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.connection_hidden (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    connection_id uuid NOT NULL REFERENCES public.connections (id) ON DELETE CASCADE,
    hidden_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_connection_hidden_user_id
    ON public.connection_hidden (user_id);

CREATE INDEX IF NOT EXISTS idx_connection_hidden_connection_id
    ON public.connection_hidden (connection_id);

ALTER TABLE public.connection_hidden ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "connection_hidden_own_all" ON public.connection_hidden;
CREATE POLICY "connection_hidden_own_all"
    ON public.connection_hidden
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_hidden TO authenticated;

-- ─── users.last_intent_update_at (for 24h expiration sweep) ──────────────────

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS last_intent_update_at timestamptz;

COMMENT ON COLUMN public.users.last_intent_update_at IS
    'UTC timestamp when availability intents were last saved; used for intent expiration policies.';
