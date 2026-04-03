-- Intent-Based Availability + data integrity limits
-- Idempotent where possible (IF NOT EXISTS / guarded DO blocks).

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

-- ─── 2. messages: max body/content length (1000 chars) ────────────────────
-- App schema uses `content`; constraint name references product term "body".

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'body'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'messages_body_max_length'
        ) THEN
            ALTER TABLE public.messages
                ADD CONSTRAINT messages_body_max_length
                CHECK (char_length(body) <= 1000);
        END IF;
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'messages'
          AND column_name = 'content'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'messages_body_max_length'
        ) THEN
            ALTER TABLE public.messages
                ADD CONSTRAINT messages_body_max_length
                CHECK (char_length(content) <= 1000);
        END IF;
    END IF;
END $$;

-- ─── 3. profiles.interests: max 5 tags, each <= 25 chars ───────────────────

-- Helper: returns TRUE when every element in the array is <= max_len chars.
-- IMMUTABLE so it can be referenced inside a CHECK constraint.
CREATE OR REPLACE FUNCTION public.check_array_element_lengths(arr text[], max_len int)
    RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    elem text;
BEGIN
    IF arr IS NULL THEN RETURN TRUE; END IF;
    FOREACH elem IN ARRAY arr LOOP
        IF char_length(elem) > max_len THEN RETURN FALSE; END IF;
    END LOOP;
    RETURN TRUE;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'profiles'
              AND column_name = 'interests'
        ) THEN
            ALTER TABLE public.profiles
                ADD COLUMN interests text[] NOT NULL DEFAULT '{}'::text[];
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'profiles_interests_limits'
        ) THEN
            ALTER TABLE public.profiles
                ADD CONSTRAINT profiles_interests_limits
                CHECK (
                    cardinality(interests) <= 5
                    AND public.check_array_element_lengths(interests, 25)
                );
        END IF;
    END IF;
END $$;
