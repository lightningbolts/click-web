-- Security limits: interest tag shape and chat message body length.
-- Supports legacy `profiles.interests` (jsonb or text[]) and current `user_interests.tags` (jsonb array).

-- ─── public.messages: body length ───────────────────────────────────────────

ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_content_length_check;

ALTER TABLE public.messages
    ADD CONSTRAINT messages_content_length_check
    CHECK (content IS NULL OR char_length(content) <= 1000);

COMMENT ON CONSTRAINT messages_content_length_check ON public.messages IS
    'Chat message body must not exceed 1000 characters.';

-- ─── public.user_interests: tags array (canonical web/mobile store) ─────────

DO $$
BEGIN
    IF to_regclass('public.user_interests') IS NOT NULL THEN
        ALTER TABLE public.user_interests
            DROP CONSTRAINT IF EXISTS user_interests_tags_length_check;

        ALTER TABLE public.user_interests
            ADD CONSTRAINT user_interests_tags_length_check
            CHECK (
                tags IS NULL
                OR jsonb_typeof(tags) <> 'array'
                OR (
                    jsonb_array_length(tags) <= 5
                    AND NOT EXISTS (
                        SELECT 1
                        FROM jsonb_array_elements_text(tags) AS t(elem)
                        WHERE char_length(elem) > 25
                    )
                )
            );

        COMMENT ON CONSTRAINT user_interests_tags_length_check ON public.user_interests IS
            'At most 5 interest tags; each tag <= 25 characters.';
    END IF;
END $$;

-- ─── public.profiles: optional legacy interests column ─────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'interests'
    ) THEN
        ALTER TABLE public.profiles
            DROP CONSTRAINT IF EXISTS profiles_interests_jsonb_check;

        ALTER TABLE public.profiles
            DROP CONSTRAINT IF EXISTS profiles_interests_text_array_check;

        -- jsonb array of strings (common in Supabase examples)
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'profiles'
              AND column_name = 'interests'
              AND data_type = 'jsonb'
        ) THEN
            ALTER TABLE public.profiles
                ADD CONSTRAINT profiles_interests_jsonb_check
                CHECK (
                    interests IS NULL
                    OR jsonb_typeof(interests) <> 'array'
                    OR (
                        jsonb_array_length(interests) <= 5
                        AND NOT EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements_text(interests) AS t(elem)
                            WHERE char_length(elem) > 25
                        )
                    )
                );

            COMMENT ON CONSTRAINT profiles_interests_jsonb_check ON public.profiles IS
                'At most 5 interests; each <= 25 characters (jsonb array).';
        END IF;

        -- text[] interests
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'profiles'
              AND column_name = 'interests'
              AND udt_name = '_text'
        ) THEN
            ALTER TABLE public.profiles
                ADD CONSTRAINT profiles_interests_text_array_check
                CHECK (
                    interests IS NULL
                    OR (
                        cardinality(interests) <= 5
                        AND NOT EXISTS (
                            SELECT 1
                            FROM unnest(interests) AS elem
                            WHERE char_length(elem) > 25
                        )
                    )
                );

            COMMENT ON CONSTRAINT profiles_interests_text_array_check ON public.profiles IS
                'At most 5 interests; each <= 25 characters (text[]).';
        END IF;
    END IF;
END $$;
