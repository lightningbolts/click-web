-- Server-driven feature flags + the shared Click Drop "develop" state machine.
--
-- 1. feature_flags: every post-9/29 feature ships dark behind one of these rows. click-web is the
--    only reader (service role); clients learn their flags from GET /api/me/features.
-- 2. click-drops: a private Storage bucket with NO client policies. Drop originals (and, for event
--    and shared drops, their pixelated previews) live here and are reachable only through signed
--    URLs click-web issues after checking the viewer and reveal time.
-- 3. drop_views: per-viewer "developed" state for chat, event and shared drops (syncs devices).
-- 4. chat_drop_originals: server-only registry of gated chat-drop originals. The object path never
--    appears in message metadata, so a client cannot sign it early.
--
-- Additive only. Existing (ungated) Click Drops and older app builds are unaffected.

-- ---------------------------------------------------------------------------
-- 1. Feature flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_flags (
    key             TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
    enabled         BOOLEAN NOT NULL DEFAULT false,
    -- Share of users (0-100) enabled by a stable hash of (key, user id), when `enabled`.
    rollout_percent INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
    -- Always on for these users when `enabled` (internal testers, pilot cohort).
    allow_user_ids  UUID[] NOT NULL DEFAULT '{}',
    -- Tunable numbers (TTLs, radii, caps). Code defaults apply to any missing key.
    config          JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
    description     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feature_flags FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.feature_flags IS
    'Server-driven feature flags (service role only). Clients read their resolved flags via GET /api/me/features.';

INSERT INTO public.feature_flags (key, description)
VALUES ('drops_develop', 'Click Drops: tap-to-develop, gated originals, batched ready push (spec §2).')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Private bucket for gated drop media (service role only: no storage.objects policies)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'click-drops',
    'click-drops',
    false,
    26214400,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Per-viewer develop state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.drop_views (
    drop_kind    TEXT NOT NULL CHECK (drop_kind IN ('chat', 'event', 'shared')),
    -- messages.id for chat drops, event_drops.id / shared_drops.id otherwise.
    drop_id      UUID NOT NULL,
    viewer_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    developed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (drop_kind, drop_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_drop_views_viewer
    ON public.drop_views (viewer_id, drop_kind, developed_at DESC);

ALTER TABLE public.drop_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drop_views FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.drop_views FROM authenticated;
GRANT SELECT ON public.drop_views TO authenticated;
DROP POLICY IF EXISTS drop_views_select_own ON public.drop_views;
CREATE POLICY drop_views_select_own ON public.drop_views
    FOR SELECT TO authenticated
    USING (viewer_id = auth.uid());

COMMENT ON TABLE public.drop_views IS
    'Per-viewer developed state for Click Drops (written only by POST /api/drops/develop after reveal_at).';

-- ---------------------------------------------------------------------------
-- 4. Gated chat-drop originals (server only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_drop_originals (
    message_id        UUID PRIMARY KEY REFERENCES public.messages (id) ON DELETE CASCADE,
    chat_id           UUID NOT NULL REFERENCES public.chats (id) ON DELETE CASCADE,
    sender_id         UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    object_path       TEXT NOT NULL UNIQUE,
    reveal_at         TIMESTAMPTZ NOT NULL,
    ready_notified_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_drop_originals_ready
    ON public.chat_drop_originals (reveal_at)
    WHERE ready_notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_drop_originals_sender
    ON public.chat_drop_originals (sender_id);

ALTER TABLE public.chat_drop_originals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_drop_originals FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.chat_drop_originals IS
    'Server-only map from a gated Click Drop message to its original in the click-drops bucket.';
