-- PostgREST upsert (INSERT … ON CONFLICT DO UPDATE) requires UPDATE privilege + policy.

GRANT UPDATE ON public.beacon_attendees TO authenticated;

DROP POLICY IF EXISTS "beacon_attendees_update_own" ON public.beacon_attendees;

CREATE POLICY "beacon_attendees_update_own"
    ON public.beacon_attendees
    FOR UPDATE
    TO authenticated
    USING (auth.uid () = user_id)
    WITH CHECK (auth.uid () = user_id);
