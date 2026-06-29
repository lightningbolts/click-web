-- Optional group avatar image shown instead of the member photo stack.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.groups.avatar_url IS
  'Public avatar image URL for verified group chats; any current member may update through the BFF.';

COMMENT ON COLUMN public.groups.profile_updated_at IS
  'Last group profile mutation time for shared name/avatar cooldown enforcement.';

COMMENT ON COLUMN public.groups.profile_updated_by IS
  'User who most recently changed group profile metadata.';

CREATE OR REPLACE FUNCTION public.rename_clique(target_group_id uuid, new_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    nm text;
    last_changed timestamptz;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;

    IF NOT public.auth_uid_in_group(target_group_id) THEN
        RAISE EXCEPTION 'not a member of this group';
    END IF;

    SELECT profile_updated_at
    INTO last_changed
    FROM public.groups
    WHERE id = target_group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'group not found';
    END IF;

    IF last_changed IS NOT NULL AND last_changed > now() - interval '60 seconds' THEN
        RAISE EXCEPTION 'group profile changes are rate limited';
    END IF;

    nm := left(coalesce(nullif(trim(new_name), ''), 'Clique'), 200);

    UPDATE public.groups
    SET
      name = nm,
      profile_updated_at = now(),
      profile_updated_by = auth.uid()
    WHERE id = target_group_id;
END;
$$;

COMMENT ON FUNCTION public.rename_clique(uuid, text) IS
  'Member-only rename of groups.name for verified cliques, rate limited with group avatar changes.';
