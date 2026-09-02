-- Waitlist signup access is finalized after security_hardening_rls.
-- Keep this separate from the older schema bootstrap: rerunning the bootstrap
-- on an upgraded project must never recreate the removed authenticated read.

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;

CREATE POLICY "Anyone can join waitlist"
    ON public.waitlist FOR INSERT
    TO anon
    WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT ON public.waitlist TO anon;
