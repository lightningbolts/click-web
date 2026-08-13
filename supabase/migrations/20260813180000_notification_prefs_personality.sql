-- Per-type notification preferences, personality tags, availability-match push dedupe.

ALTER TABLE public.notification_preferences
    ADD COLUMN IF NOT EXISTS event_reminder_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS availability_match_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS hub_message_push_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.notification_preferences.event_reminder_push_enabled IS
    'When false, event day-of / 30-min reminder pushes are skipped.';
COMMENT ON COLUMN public.notification_preferences.availability_match_push_enabled IS
    'When false, mutual availability-intent match pushes are skipped.';
COMMENT ON COLUMN public.notification_preferences.hub_message_push_enabled IS
    'When false, community hub message pushes are skipped.';

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS personality_tags TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.users.personality_tags IS
    'Exactly five curated personality traits (onboarding + settings). Empty until chosen.';

CREATE TABLE IF NOT EXISTS public.availability_match_pushes (
    intent_id_lo UUID NOT NULL,
    intent_id_hi UUID NOT NULL,
    notified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (intent_id_lo, intent_id_hi)
);

CREATE INDEX IF NOT EXISTS idx_availability_match_pushes_notified
    ON public.availability_match_pushes (notified_at DESC);

COMMENT ON TABLE public.availability_match_pushes IS
    'Dedupes availability-intent match pushes for a pair of overlapping intent rows.';

ALTER TABLE public.availability_match_pushes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.availability_match_pushes TO service_role;
