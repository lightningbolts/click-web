-- Click Places, step 1: the B2B venue tables become the product's Place tables.
-- Compatibility views keep every old name (venues, venue_managers, venue_check_ins) working for
-- existing code, RPC bodies, the Android client and the Stripe webhook until they are migrated.
-- Policies, indexes, foreign keys and the venue_metrics_materialized view follow the table by OID.

DO $$
BEGIN
    IF to_regclass('public.places') IS NULL THEN
        ALTER TABLE public.venues RENAME TO places;
    END IF;

    IF to_regclass('public.place_managers') IS NULL THEN
        ALTER TABLE public.venue_managers RENAME TO place_managers;
        ALTER TABLE public.place_managers RENAME COLUMN venue_id TO place_id;
    END IF;

    IF to_regclass('public.place_check_ins') IS NULL THEN
        ALTER TABLE public.venue_check_ins RENAME TO place_check_ins;
        ALTER TABLE public.place_check_ins RENAME COLUMN venue_id TO place_id;
    END IF;
END $$;

-- Simple single-table views are auto-updatable; security_invoker applies the base table's RLS
-- and grants to the caller, exactly as before the rename.
CREATE OR REPLACE VIEW public.venues WITH (security_invoker = true) AS
    SELECT * FROM public.places;

CREATE OR REPLACE VIEW public.venue_managers WITH (security_invoker = true) AS
    SELECT id, user_id, place_id AS venue_id, role, created_at
    FROM public.place_managers;

CREATE OR REPLACE VIEW public.venue_check_ins WITH (security_invoker = true) AS
    SELECT id, place_id AS venue_id, user_id, checked_at, created_at, beacon_id
    FROM public.place_check_ins;

COMMENT ON VIEW public.venues IS 'Compatibility view for public.places (Click Places rename). New code uses places.';
COMMENT ON VIEW public.venue_managers IS 'Compatibility view for public.place_managers. New code uses place_managers.place_id.';
COMMENT ON VIEW public.venue_check_ins IS 'Compatibility view for public.place_check_ins.';

-- Mirror the grants the old tables had (20260331120000 / 20260331130000).
GRANT SELECT, INSERT, UPDATE ON public.venues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_managers TO authenticated;
GRANT SELECT ON public.venue_check_ins TO authenticated;
GRANT ALL ON public.venues, public.venue_managers, public.venue_check_ins TO service_role;

NOTIFY pgrst, 'reload schema';
