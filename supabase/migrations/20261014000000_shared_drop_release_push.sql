-- Push when a connection's shared Click Drop develops ("Maya's drop just developed"), sent within
-- a minute by the per-minute cron. Each drop is claimed once (release_notified_at) before its
-- push; only drops that developed in the last 30 minutes are ever considered, so existing rows
-- are left alone. A notification preference turns it off. Additive and idempotent.

ALTER TABLE public.shared_drops
    ADD COLUMN IF NOT EXISTS release_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shared_drops_release_due
    ON public.shared_drops (reveal_at)
    WHERE release_notified_at IS NULL AND deleted_at IS NULL;

ALTER TABLE public.notification_preferences
    ADD COLUMN IF NOT EXISTS drop_release_push_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.notification_preferences.drop_release_push_enabled IS
    'Push when a connection''s shared Click Drop develops (cron/scheduled-messages → runSharedDropsReleased).';
