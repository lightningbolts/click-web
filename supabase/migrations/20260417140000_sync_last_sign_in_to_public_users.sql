-- Mirror auth.users.last_sign_in_at onto public.users."lastSignedIn" for analytics / admin surfaces.
-- Column is quoted camelCase to match application naming.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "lastSignedIn" TIMESTAMPTZ;

COMMENT ON COLUMN public.users."lastSignedIn" IS 'Copied from auth.users.last_sign_in_at on each sign-in (via trigger).';

CREATE OR REPLACE FUNCTION public.sync_auth_last_sign_in_to_public_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE public.users
    SET "lastSignedIn" = NEW.last_sign_in_at
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_sync_last_sign_in ON auth.users;

CREATE TRIGGER trg_auth_users_sync_last_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_last_sign_in_to_public_users();
