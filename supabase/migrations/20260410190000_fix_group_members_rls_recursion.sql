-- Fix infinite RLS recursion on public.group_members (policy subquery re-entered same table).
-- Also expose a SECURITY DEFINER graph check for client UI (friend–friend edges not visible in self's connection list).

CREATE OR REPLACE FUNCTION public.auth_uid_in_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = p_group_id
          AND gm.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.auth_uid_in_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_uid_in_group(uuid) TO authenticated;

COMMENT ON FUNCTION public.auth_uid_in_group(uuid) IS
    'True when auth.uid() is a member of p_group_id; used by RLS without self-referential scans.';

DROP POLICY IF EXISTS "groups_select_member" ON public.groups;
CREATE POLICY "groups_select_member"
    ON public.groups FOR SELECT
    USING (public.auth_uid_in_group(id));

DROP POLICY IF EXISTS "group_members_select_peers" ON public.group_members;
CREATE POLICY "group_members_select_peers"
    ON public.group_members FOR SELECT
    USING (public.auth_uid_in_group(group_id));

-- ─── RPC: full graph check (caller must be in the set) ───────────────────────

CREATE OR REPLACE FUNCTION public.verified_clique_edges_exist(p_member_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    members uuid[];
    n int;
    i int;
    j int;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::uuid[])
    INTO members
    FROM (SELECT DISTINCT unnest(coalesce(p_member_ids, ARRAY[]::uuid[])) AS x) s;

    n := array_length(members, 1);
    IF n IS NULL OR n < 2 THEN
        RETURN false;
    END IF;

    IF NOT (auth.uid() = ANY (members)) THEN
        RETURN false;
    END IF;

    FOR i IN 1..n LOOP
        FOR j IN (i + 1)..n LOOP
            IF NOT EXISTS (
                SELECT 1
                FROM public.connections c
                WHERE c.status IN ('active', 'kept')
                  AND cardinality(c.user_ids) = 2
                  AND c.user_ids @> ARRAY[members[i]::text, members[j]::text]
            ) THEN
                RETURN false;
            END IF;
        END LOOP;
    END LOOP;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.verified_clique_edges_exist(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verified_clique_edges_exist(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.verified_clique_edges_exist(uuid[]) IS
    'True when every unordered pair in p_member_ids has an active/kept 1:1 connection; caller must be in the set.';
