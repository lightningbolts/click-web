-- Reactions on soundtrack beacons and shared Click Drops (Locket-style): one emoji per person per
-- thing, replaceable or removable. Who may react or see reactions follows the target's own rules
-- (a soundtrack the viewer can see; a shared drop's audience, once it has developed). The owner
-- sees everyone's reaction; others see their own and their connections'. Server only; additive.

CREATE TABLE IF NOT EXISTS public.reactions (
    target_kind TEXT NOT NULL CHECK (target_kind IN ('soundtrack', 'shared_drop')),
    target_id   UUID NOT NULL,
    user_id     UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (target_kind, target_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reactions_target ON public.reactions (target_kind, target_id, created_at DESC);

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reactions FROM PUBLIC, anon, authenticated;
