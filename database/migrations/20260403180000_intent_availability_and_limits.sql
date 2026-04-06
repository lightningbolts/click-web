-- Intent-Based Availability
-- Idempotent where possible (IF NOT EXISTS / guarded DO blocks).
-- Message body and profile interests limits: supabase/migrations/20260406120000_security_limits.sql

-- ─── 1. availability_intents ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.availability_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    timeframe varchar NOT NULL,
    intent_tag varchar(25) NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_availability_intents_user_id
    ON public.availability_intents (user_id);

CREATE INDEX IF NOT EXISTS idx_availability_intents_expires_at
    ON public.availability_intents (expires_at);

COMMENT ON TABLE public.availability_intents IS
    'Short-lived user availability windows with an intent tag (e.g. coffee, walk).';

ALTER TABLE public.availability_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_intents_own_all" ON public.availability_intents;
CREATE POLICY "availability_intents_own_all"
    ON public.availability_intents
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_intents TO authenticated;
