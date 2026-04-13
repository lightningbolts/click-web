-- E2EE chat attachments: Storage bucket + RLS for `chat-media`.
-- Paths:
--   • Native (KMP): `{uploader_uid}/{chat_uuid}/{filename}` — uploader must be auth.uid() and a
--     participant of that chat (connection pair OR verified group member).
--   • Web: `web/{uploader_uid}/{filename}` — uploader must match folder (no chat id in path).

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "chat_media_select_public" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_insert_participant" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_update_participant" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_select_authenticated" ON storage.objects;

CREATE POLICY "chat_media_select_public"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'chat-media');

CREATE POLICY "chat_media_insert_participant"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (
      (
        split_part(name, '/', 1) = 'web'
        AND split_part(name, '/', 2) = auth.uid()::text
      )
      OR (
        split_part(name, '/', 1) = auth.uid()::text
        AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
        AND EXISTS (
          SELECT 1
          FROM public.chats ch
          WHERE ch.id = split_part(name, '/', 2)::uuid
            AND (
              EXISTS (
                SELECT 1
                FROM public.connections c
                WHERE c.id = ch.connection_id
                  AND auth.uid()::text = ANY (c.user_ids)
              )
              OR EXISTS (
                SELECT 1
                FROM public.group_members gm
                WHERE gm.group_id = ch.group_id
                  AND gm.user_id = auth.uid()
              )
            )
        )
      )
    )
  );

CREATE POLICY "chat_media_update_participant"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      (
        split_part(name, '/', 1) = 'web'
        AND split_part(name, '/', 2) = auth.uid()::text
      )
      OR (
        split_part(name, '/', 1) = auth.uid()::text
        AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
        AND EXISTS (
          SELECT 1
          FROM public.chats ch
          WHERE ch.id = split_part(name, '/', 2)::uuid
            AND (
              EXISTS (
                SELECT 1
                FROM public.connections c
                WHERE c.id = ch.connection_id
                  AND auth.uid()::text = ANY (c.user_ids)
              )
              OR EXISTS (
                SELECT 1
                FROM public.group_members gm
                WHERE gm.group_id = ch.group_id
                  AND gm.user_id = auth.uid()
              )
            )
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (
      (
        split_part(name, '/', 1) = 'web'
        AND split_part(name, '/', 2) = auth.uid()::text
      )
      OR (
        split_part(name, '/', 1) = auth.uid()::text
        AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
        AND EXISTS (
          SELECT 1
          FROM public.chats ch
          WHERE ch.id = split_part(name, '/', 2)::uuid
            AND (
              EXISTS (
                SELECT 1
                FROM public.connections c
                WHERE c.id = ch.connection_id
                  AND auth.uid()::text = ANY (c.user_ids)
              )
              OR EXISTS (
                SELECT 1
                FROM public.group_members gm
                WHERE gm.group_id = ch.group_id
                  AND gm.user_id = auth.uid()
              )
            )
        )
      )
    )
  );

CREATE POLICY "chat_media_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      (
        split_part(name, '/', 1) = 'web'
        AND split_part(name, '/', 2) = auth.uid()::text
      )
      OR (
        split_part(name, '/', 1) = auth.uid()::text
        AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
        AND EXISTS (
          SELECT 1
          FROM public.chats ch
          WHERE ch.id = split_part(name, '/', 2)::uuid
            AND (
              EXISTS (
                SELECT 1
                FROM public.connections c
                WHERE c.id = ch.connection_id
                  AND auth.uid()::text = ANY (c.user_ids)
              )
              OR EXISTS (
                SELECT 1
                FROM public.group_members gm
                WHERE gm.group_id = ch.group_id
                  AND gm.user_id = auth.uid()
              )
            )
        )
      )
    )
  );
