-- Shared Click Drops behave like stories: they develop one hour after posting instead of 24.
-- Drops still pending are moved to the new window (never later than they were), so nothing
-- already shared waits a day. Chat and event drops keep their own timing. Idempotent.

UPDATE public.feature_flags
SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{develop_hours}', '1'::jsonb)
WHERE key = 'shared_drops';

UPDATE public.shared_drops
SET reveal_at = created_at + interval '1 hour'
WHERE deleted_at IS NULL
  AND reveal_at > created_at + interval '1 hour'
  AND reveal_at > now();
