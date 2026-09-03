-- The contact-hash trigger calls pgcrypto functions in the extensions schema.
-- Keep the SECURITY DEFINER function explicit and safe when invoked by auth.users.
ALTER FUNCTION public.sync_user_contact_hashes()
  SET search_path = public, extensions, pg_temp;
