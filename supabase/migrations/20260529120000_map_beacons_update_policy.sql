-- Allow beacon creators to update their own rows (PATCH /api/beacons/[beaconId]).
CREATE POLICY "map_beacons_update_own"
    ON public.map_beacons
    FOR UPDATE
    TO authenticated
    USING (auth.uid () = creator_id)
    WITH CHECK (auth.uid () = creator_id);

GRANT UPDATE ON public.map_beacons TO authenticated;
