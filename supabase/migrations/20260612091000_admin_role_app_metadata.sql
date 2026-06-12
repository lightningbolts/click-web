-- Admin role hardening: the app now reads the admin role from app_metadata
-- (service-role writable only) instead of user_metadata (end-user writable via
-- supabase.auth.updateUser — a privilege-escalation vector).
--
-- Copy existing admin grants so current admins keep access after the code change.

UPDATE auth.users
SET raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
WHERE raw_user_meta_data ->> 'role' = 'admin'
  AND coalesce(raw_app_meta_data ->> 'role', '') <> 'admin';

-- Future grants: use the Supabase Dashboard or
--   supabase auth admin update-user --user-id <id> --app-metadata '{"role":"admin"}'
-- Never write `role` into user_metadata.
