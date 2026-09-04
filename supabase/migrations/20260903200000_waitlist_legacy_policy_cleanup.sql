-- Remove the legacy broad waitlist policy left by the original production
-- setup. The explicit anon-only signup policy owns this access now.
DROP POLICY IF EXISTS "Allow public waitlist inserts" ON public.waitlist;
