-- Hub chat: metadata + message_type for E2EE media parity with core chat.

ALTER TABLE public.hub_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';

COMMENT ON COLUMN public.hub_messages.metadata IS
  'JSON (e.g. media_url, is_encrypted_media, original_mime_type for hub media).';

COMMENT ON COLUMN public.hub_messages.message_type IS
  'Message kind: text, image, audio — aligned with client ChatMessageType.';
