-- The legacy schema bootstrap grants broad table privileges to authenticated.
-- The waitlist is an anonymous-signup surface; authenticated clients must not
-- retain a direct INSERT privilege even though the INSERT policy is anon-only.
REVOKE INSERT ON public.waitlist FROM authenticated;
