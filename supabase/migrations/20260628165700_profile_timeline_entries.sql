-- Profile and group timeline journal entries.

CREATE TABLE IF NOT EXISTS public.profile_timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'chat')),
  target_id UUID NOT NULL,
  author_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 1200),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_timeline_entries_target_idx
  ON public.profile_timeline_entries (target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS profile_timeline_entries_author_idx
  ON public.profile_timeline_entries (author_user_id, created_at DESC);

ALTER TABLE public.profile_timeline_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_timeline_entries_select_visible ON public.profile_timeline_entries;
CREATE POLICY profile_timeline_entries_select_visible ON public.profile_timeline_entries
  FOR SELECT
  USING (
    author_user_id = auth.uid()
    OR (
      visibility = 'shared'
      AND (
        (
          target_type = 'user'
          AND (
            target_id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.connections c
              WHERE c.user_ids @> ARRAY[auth.uid()::text, target_id::text]
            )
          )
        )
        OR (
          target_type = 'chat'
          AND EXISTS (
            SELECT 1
            FROM public.chats ch
            WHERE ch.id = target_id
              AND (
                (
                  ch.group_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM public.group_members gm
                    WHERE gm.group_id = ch.group_id
                      AND gm.user_id = auth.uid()
                  )
                )
                OR (
                  ch.connection_id IS NOT NULL
                  AND EXISTS (
                    SELECT 1
                    FROM public.connections c
                    WHERE c.id = ch.connection_id
                      AND auth.uid()::text = ANY (c.user_ids)
                  )
                )
              )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS profile_timeline_entries_insert_author ON public.profile_timeline_entries;
CREATE POLICY profile_timeline_entries_insert_author ON public.profile_timeline_entries
  FOR INSERT
  WITH CHECK (author_user_id = auth.uid());

DROP POLICY IF EXISTS profile_timeline_entries_update_author ON public.profile_timeline_entries;
CREATE POLICY profile_timeline_entries_update_author ON public.profile_timeline_entries
  FOR UPDATE
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

DROP POLICY IF EXISTS profile_timeline_entries_delete_author ON public.profile_timeline_entries;
CREATE POLICY profile_timeline_entries_delete_author ON public.profile_timeline_entries
  FOR DELETE
  USING (author_user_id = auth.uid());

COMMENT ON TABLE public.profile_timeline_entries IS
  'Private or shared journal entries shown in individual and group profile timeline tabs.';
