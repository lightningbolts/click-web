-- Activity inbox: every alert a person got (events, drops, reactions, nudges, matches), readable
-- in-app whether or not push is allowed. Written by `send-push-notification` for each alert push
-- and by API routes for in-app-only activity (reactions, RSVPs). Server only: clients read it
-- through GET /api/activity.

CREATE TABLE IF NOT EXISTS public.activity_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
    type       TEXT NOT NULL CHECK (char_length(type) BETWEEN 1 AND 64),
    title      TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    body       TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 400),
    -- The push payload (string values): clients route a tap exactly like the push itself.
    data       JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Who it's about (avatar), when there is one person. Their account leaving removes it.
    actor_id   UUID REFERENCES public.users (id) ON DELETE CASCADE,
    -- Rolls repeats into one row ("Maya and 3 others reacted"); null rows never merge.
    group_key  TEXT CHECK (group_key IS NULL OR char_length(group_key) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_items_user_created
    ON public.activity_items (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_items_user_group
    ON public.activity_items (user_id, group_key)
    WHERE group_key IS NOT NULL;

-- When the person last opened the inbox: items newer than this are "new" (the Home badge).
CREATE TABLE IF NOT EXISTS public.activity_seen (
    user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
    seen_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.activity_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.activity_seen FROM PUBLIC, anon, authenticated;

-- One write path for every caller (edge function and API routes). A grouped item moves to the
-- top with the newest copy. Items older than 90 days are pruned on the way (index-only for
-- this user), so the table never needs a sweep.
CREATE OR REPLACE FUNCTION public.record_activity(
    p_user_id   UUID,
    p_type      TEXT,
    p_title     TEXT,
    p_body      TEXT DEFAULT '',
    p_data      JSONB DEFAULT '{}'::jsonb,
    p_actor_id  UUID DEFAULT NULL,
    p_group_key TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.activity_items (user_id, type, title, body, data, actor_id, group_key)
    VALUES (p_user_id, p_type, left(p_title, 200), left(coalesce(p_body, ''), 400),
            coalesce(p_data, '{}'::jsonb), p_actor_id, p_group_key)
    ON CONFLICT (user_id, group_key) WHERE group_key IS NOT NULL
    DO UPDATE SET type = EXCLUDED.type,
                  title = EXCLUDED.title,
                  body = EXCLUDED.body,
                  data = EXCLUDED.data,
                  actor_id = EXCLUDED.actor_id,
                  created_at = now();

    DELETE FROM public.activity_items
    WHERE user_id = p_user_id AND created_at < now() - INTERVAL '90 days';
END;
$$;

REVOKE ALL ON FUNCTION public.record_activity(UUID, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_activity(UUID, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) TO service_role;

COMMENT ON TABLE public.activity_items IS
    'Server only. The in-app activity inbox; see record_activity and GET /api/activity.';
COMMENT ON TABLE public.activity_seen IS
    'Server only. When each person last opened the activity inbox.';
