-- Optional group avatar image shown instead of the member photo stack.

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.groups.avatar_url IS
  'Public avatar image URL for verified group chats; any current member may update through the BFF.';
