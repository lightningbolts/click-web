-- E2EE arbitrary chat attachments (Phase 2 — B3).
--
-- Separate bucket from `chat-media` so we can enforce a strict MIME allow-list and a 2 MiB
-- object size limit at the Storage layer. All bytes in this bucket are already ciphertext —
-- the symmetric key travels inside the E2EE message body via the `ccx:v1:` envelope — but we
-- still gate the payload surface here so a malicious peer cannot flood the bucket with
-- non-allow-listed blobs.
--
-- Path format (single layout — unlike chat-media, there is no separate `web/` prefix):
--     {chat_uuid}/{uploader_uid}/{filename}
--
-- RLS invariants:
--   • Bucket is PRIVATE (public = false). Object contents are ciphertext — reads go through
--     short-lived signed URLs or authenticated downloads.
--   • Uploader must own the `{uploader_uid}` segment (segment 2) AND be a participant of
--     `{chat_uuid}` (segment 1) via `public.chats` → `public.connections` OR `public.group_members`.
--   • Readers must be participants of `{chat_uuid}` (same check, no web/native split).
--   • UPDATE / DELETE limited to the original uploader.
--
-- Storage-side guards (set via `storage.buckets`):
--   • file_size_limit  = 2_097_152 bytes (2 MiB). Must stay in sync with
--     ChatAttachmentValidator.MAX_ATTACHMENT_BYTES (KMP) and MAX_ATTACHMENT_BYTES (web).
--   • allowed_mime_types  — pdf, docx, txt, png, jpg, jpeg, mov, mp4, zip, csv.
--     Must stay in sync with ALLOWED_MIME_TYPES on both clients.

-- ---------------------------------------------------------------------------
-- 1) Participant helper (SECURITY DEFINER so RLS policies avoid recursing into
--     the same tables that ship RLS themselves, e.g. group_members).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_chat_access(p_uid uuid, p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chats ch
    WHERE ch.id = p_chat_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.connections c
          WHERE c.id = ch.connection_id
            AND p_uid::text = ANY (c.user_ids)
        )
        OR EXISTS (
          SELECT 1
          FROM public.group_members gm
          WHERE gm.group_id = ch.group_id
            AND gm.user_id = p_uid
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_chat_access(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.has_chat_access(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_chat_access(uuid, uuid) IS
  'Returns true when the given auth.uid() is a participant of the chat (connection peer OR group member). SECURITY DEFINER to sidestep recursive RLS on group_members.';

-- ---------------------------------------------------------------------------
-- 2) Bucket: create + enforce 2 MiB ceiling + MIME allow-list.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  2097152,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'video/quicktime',
    'video/mp4',
    'application/zip',
    'application/x-zip-compressed',
    'text/csv',
    'application/csv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 3) RLS policies.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "chat_attachments_select_participant" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_insert_participant" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_update_owner"        ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_delete_owner"        ON storage.objects;

CREATE POLICY "chat_attachments_select_participant"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    AND public.has_chat_access(auth.uid(), split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "chat_attachments_insert_participant"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    AND split_part(name, '/', 2) = auth.uid()::text
    AND public.has_chat_access(auth.uid(), split_part(name, '/', 1)::uuid)
  );

CREATE POLICY "chat_attachments_update_owner"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 2) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

CREATE POLICY "chat_attachments_delete_owner"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 2) = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 4) Document the new `message_type` value so operators know `'file'` is now
--    a valid setting on public.messages and public.hub_messages.
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.messages.message_type IS
  'Message kind: text, image, audio, call_log, file. `file` carries an encrypted attachment per ccx:v1: envelope.';

COMMENT ON COLUMN public.hub_messages.message_type IS
  'Message kind: text, image, audio, file — aligned with client ChatMessageType.';
