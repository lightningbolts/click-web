-- "Message deleted" placeholders. Deleting a message still hard-deletes the `messages` row
-- (older clients rely on the realtime DELETE); this side table records where it was so
-- clients that opt in (`GET /api/chat/messages?include_tombstones=1`) can show a tombstone.
CREATE TABLE IF NOT EXISTS public.message_tombstones (
    message_id uuid PRIMARY KEY,
    chat_id uuid NOT NULL,
    user_id uuid NOT NULL,
    time_created bigint NOT NULL,
    deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_tombstones_chat_time_idx
    ON public.message_tombstones (chat_id, time_created DESC);

-- Service-role only: the API checks chat access before reading or writing.
ALTER TABLE public.message_tombstones ENABLE ROW LEVEL SECURITY;
