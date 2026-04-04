-- Security / data integrity limits (messages body length, profile interests tags).
-- Idempotent: guarded DO blocks and CREATE OR REPLACE for the helper.

-- ─── Helper: each text[] element length <= max_len (no subqueries in CHECK) ─

CREATE OR REPLACE FUNCTION public.check_array_element_lengths(arr text[], max_len int)
    RETURNS boolean
    LANGUAGE plpgsql
    IMMUTABLE
AS $$
DECLARE
    elem text;
BEGIN
    IF arr IS NULL THEN
        RETURN TRUE;
    END IF;
    FOREACH elem IN ARRAY arr LOOP
        IF char_length(elem) > max_len THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$$;

-- ─── messages: body (or app column `content`) max 1000 characters ───────────

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
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'messages_body_max_length'
              AND n.nspname = 'public'
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
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'messages_body_max_length'
              AND n.nspname = 'public'
        ) THEN
            ALTER TABLE public.messages
                ADD CONSTRAINT messages_body_max_length
                CHECK (char_length(content) <= 1000);
        END IF;
    END IF;
END $$;

-- ─── profiles.interests: max 5 tags, each <= 25 chars ───────────────────────

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
            SELECT 1 FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'profiles_interests_limits'
              AND n.nspname = 'public'
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
