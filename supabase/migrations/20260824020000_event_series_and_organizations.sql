-- P1: event series grouping + optional organization ownership on map_beacons.
-- Additive. creator_id remains the permission source; owner_org_id is unused by app.

-- ---------------------------------------------------------------------------
-- 1. Recurrence grouping (not a self-FK; generated at create time later)
-- ---------------------------------------------------------------------------
ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS series_id UUID NULL;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS series_sequence INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_map_beacons_series_id
    ON public.map_beacons (series_id)
    WHERE series_id IS NOT NULL;

COMMENT ON COLUMN public.map_beacons.series_id IS
    'Shared grouping key for recurring event instances. Nullable, unused by the current single-event create flow.';

COMMENT ON COLUMN public.map_beacons.series_sequence IS
    '1-based sequence within a series. Nullable, unused until recurrence ships.';

-- ---------------------------------------------------------------------------
-- 2. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    org_type TEXT NOT NULL DEFAULT 'club' CHECK (
        org_type IN ('club', 'business', 'campus_dept', 'other')
    ),
    created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS
    'Optional club/business/campus owner for events. Additive; map_beacons.creator_id stays the live auth source.';

CREATE TABLE IF NOT EXISTS public.organization_members (
    org_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'manager', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user
    ON public.organization_members (user_id);

COMMENT ON TABLE public.organization_members IS
    'Org membership. RLS mirrors venue_managers (own-row select; first-owner insert; owner-managed).';

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS owner_org_id UUID NULL REFERENCES public.organizations (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_map_beacons_owner_org
    ON public.map_beacons (owner_org_id)
    WHERE owner_org_id IS NOT NULL;

COMMENT ON COLUMN public.map_beacons.owner_org_id IS
    'Optional org owner. Unused by userMayManageBeacon (still creator_id or venue_managers).';

-- ---------------------------------------------------------------------------
-- 3. RLS (venue_managers / venues pattern)
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
CREATE POLICY organizations_select_member
    ON public.organizations
    FOR SELECT
    TO authenticated
    USING (
        created_by = auth.uid ()
        OR EXISTS (
            SELECT 1
            FROM public.organization_members m
            WHERE m.org_id = organizations.id
              AND m.user_id = auth.uid ()
        )
    );

DROP POLICY IF EXISTS organizations_insert_creator ON public.organizations;
CREATE POLICY organizations_insert_creator
    ON public.organizations
    FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid ());

DROP POLICY IF EXISTS organizations_update_owner ON public.organizations;
CREATE POLICY organizations_update_owner
    ON public.organizations
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.organization_members m
            WHERE m.org_id = organizations.id
              AND m.user_id = auth.uid ()
              AND m.role = 'owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.organization_members m
            WHERE m.org_id = organizations.id
              AND m.user_id = auth.uid ()
              AND m.role = 'owner'
        )
    );

DROP POLICY IF EXISTS organizations_delete_owner ON public.organizations;
CREATE POLICY organizations_delete_owner
    ON public.organizations
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.organization_members m
            WHERE m.org_id = organizations.id
              AND m.user_id = auth.uid ()
              AND m.role = 'owner'
        )
    );

DROP POLICY IF EXISTS organization_members_select_self ON public.organization_members;
CREATE POLICY organization_members_select_self
    ON public.organization_members
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid ());

DROP POLICY IF EXISTS organization_members_insert_self_owner ON public.organization_members;
CREATE POLICY organization_members_insert_self_owner
    ON public.organization_members
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid ()
        AND role = 'owner'
        AND NOT EXISTS (
            SELECT 1
            FROM public.organization_members m2
            WHERE m2.org_id = organization_members.org_id
        )
    );

DROP POLICY IF EXISTS organization_members_insert_by_owner ON public.organization_members;
CREATE POLICY organization_members_insert_by_owner
    ON public.organization_members
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.organization_members m0
            WHERE m0.org_id = organization_members.org_id
              AND m0.user_id = auth.uid ()
              AND m0.role = 'owner'
        )
    );

DROP POLICY IF EXISTS organization_members_update_owner ON public.organization_members;
CREATE POLICY organization_members_update_owner
    ON public.organization_members
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.organization_members m0
            WHERE m0.org_id = organization_members.org_id
              AND m0.user_id = auth.uid ()
              AND m0.role = 'owner'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.organization_members m0
            WHERE m0.org_id = organization_members.org_id
              AND m0.user_id = auth.uid ()
              AND m0.role = 'owner'
        )
    );

DROP POLICY IF EXISTS organization_members_delete_owner ON public.organization_members;
CREATE POLICY organization_members_delete_owner
    ON public.organization_members
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.organization_members m0
            WHERE m0.org_id = organization_members.org_id
              AND m0.user_id = auth.uid ()
              AND m0.role = 'owner'
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
