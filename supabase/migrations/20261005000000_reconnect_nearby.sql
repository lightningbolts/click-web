-- F6: location-based reconnection nudges — "You met Maya near here in June" as a Home card when
-- you're back where you met someone 2+ weeks ago. Push is a separate, later decision.
--
-- The client sends coarse coordinates (~100 m) on app open; click-web picks at most one candidate
-- from the viewer's own encounter history and never stores the viewer's position. Additive only;
-- ships dark.

INSERT INTO public.feature_flags (key, description, config)
VALUES (
    'reconnect_nearby',
    'Location-based reconnection nudges, Home card (spec F6).',
    '{"radius_meters": 100, "min_age_days": 14, "cooldown_days": 30, "frequent_place_days": 5, "frequent_window_days": 90}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- One row per nudge shown: enforces one a day and a 30-day cooldown per connection, and records
-- whether it was acted on or dismissed (pilot analytics without PII).
CREATE TABLE IF NOT EXISTS public.place_nudges (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES public.connections (id) ON DELETE CASCADE,
    encounter_id  UUID REFERENCES public.connection_encounters (id) ON DELETE SET NULL,
    shown_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    acted_at      TIMESTAMPTZ,
    dismissed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_place_nudges_user_recent
    ON public.place_nudges (user_id, shown_at DESC);

ALTER TABLE public.place_nudges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_nudges FROM PUBLIC, anon, authenticated;

-- "Not here" / "Not about them": muted places (a ~100 m cell) and people.
CREATE TABLE IF NOT EXISTS public.nudge_mutes (
    user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('place', 'person')),
    target_id   TEXT NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, target_type, target_id)
);

ALTER TABLE public.nudge_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nudge_mutes FROM PUBLIC, anon, authenticated;
