-- Community hubs are permanent place-scoped rooms (not 24h ephemeral venues).
-- Null expires_at = never expires. get_hubs_nearby already allows expires_at IS NULL.

COMMENT ON COLUMN public.hub_venues.expires_at IS
    'Optional end time; NULL means the hub never expires. New hubs are created with NULL.';

UPDATE public.hub_venues
SET expires_at = NULL
WHERE expires_at IS NOT NULL;
