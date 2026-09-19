-- Align the shared private chat-attachments bucket with the encrypted media API.
--
-- Arbitrary file attachments remain capped and MIME-validated by /api/chat/attachments
-- at 2 MiB. The shared Storage bucket must be able to hold the larger encrypted
-- image/audio payload accepted by /api/chat/media (25 MiB), otherwise valid voice notes
-- and photos are rejected after the application layer has already accepted them.
--
-- Keep this migration byte-identical in click-web (source of truth) and click.

UPDATE storage.buckets
SET
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/quicktime',
    'video/mp4',
    'application/zip',
    'application/x-zip-compressed',
    'text/csv',
    'application/csv',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/aac',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/webm'
  ]::text[]
WHERE id = 'chat-attachments';
