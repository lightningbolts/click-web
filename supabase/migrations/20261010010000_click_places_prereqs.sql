-- Click Places, step 2: privacy columns + no direct client writes to Places or their managers.

-- 1. Privacy columns. location_include_in_insights_enabled already exists in production (written
--    by the mobile Settings screen); IF NOT EXISTS makes this a no-op there and declares it for
--    fresh databases. Default false = no accidental opt-in (matches iOS LocationPrivacy).
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS location_include_in_insights_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS place_visits_visible_to_connections BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.place_visits_visible_to_connections IS
    'Click Places: when true, the user''s connections see them under "Clicks who''ve been here" (no times).';

-- Harmless when users already has a table-level UPDATE grant; required if it uses column grants.
GRANT UPDATE (place_visits_visible_to_connections) ON public.users TO authenticated;

-- 2. Places and managers are written only by click-web with the service role from now on.
REVOKE INSERT, UPDATE, DELETE ON public.places FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.venues FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.place_managers FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.venue_managers FROM authenticated, anon;

DROP POLICY IF EXISTS "venues_insert_authenticated" ON public.places;
DROP POLICY IF EXISTS "venues_update_owners" ON public.places;
DROP POLICY IF EXISTS "venue_managers_insert_self_owner" ON public.place_managers;
DROP POLICY IF EXISTS "venue_managers_insert_by_owner" ON public.place_managers;
DROP POLICY IF EXISTS "venue_managers_update_owner_role" ON public.place_managers;
DROP POLICY IF EXISTS "venue_managers_delete_owner" ON public.place_managers;
-- Kept: venues_select_managers (on places), venue_managers_select_self (on place_managers).

NOTIFY pgrst, 'reload schema';
