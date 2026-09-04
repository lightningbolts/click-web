-- Remove explicit anon grants left by earlier function definitions.
-- REVOKE ... FROM PUBLIC does not remove a grant recorded directly for anon.

REVOKE EXECUTE ON FUNCTION public.auth_uid_in_hub(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_uid_in_hub(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_uid_in_hub(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_uid_in_hub(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fetch_map_beacons_within(double precision, double precision, double precision, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fetch_map_beacons_within(double precision, double precision, double precision, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within(double precision, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_map_beacons_within(double precision, double precision, double precision, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fetch_my_active_map_beacons(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fetch_my_active_map_beacons(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fetch_my_active_map_beacons(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_active_map_beacons(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_creator_active_map_beacons(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hubs_nearby(double precision, double precision, double precision, integer) TO service_role;
