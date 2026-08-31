-- Beacon photos are stored in the public `avatars` bucket.
-- Historical uploads used `beacons/{userId}/...`, which failed
-- `avatars_insert_own_prefix` because the first path segment was not auth.uid().
-- The API now writes `{userId}/beacons/...` (matches existing avatar RLS).
-- This migration also allows the legacy `beacons/{uid}/...` prefix so either
-- layout can INSERT/UPDATE/DELETE, and restates map_beacons INSERT so creators
-- may attach metadata.image_url after a successful storage upload.

DROP POLICY IF EXISTS "avatars_insert_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own_prefix" ON storage.objects;

CREATE POLICY "avatars_insert_own_prefix"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR (
        split_part(name, '/', 1) = 'beacons'
        AND split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );

CREATE POLICY "avatars_update_own_prefix"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR (
        split_part(name, '/', 1) = 'beacons'
        AND split_part(name, '/', 2) = auth.uid()::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR (
        split_part(name, '/', 1) = 'beacons'
        AND split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );

CREATE POLICY "avatars_delete_own_prefix"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR (
        split_part(name, '/', 1) = 'beacons'
        AND split_part(name, '/', 2) = auth.uid()::text
      )
    )
  );

-- Public SELECT on avatars is unchanged (getPublicUrl for beacon photos).
-- map_beacons INSERT already allows auth.uid() = creator_id; restate so
-- metadata.image_url attached after storage upload is explicitly permitted.

DROP POLICY IF EXISTS "map_beacons_insert_authenticated" ON public.map_beacons;

CREATE POLICY "map_beacons_insert_authenticated"
    ON public.map_beacons
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid () = creator_id);

COMMENT ON POLICY "map_beacons_insert_authenticated" ON public.map_beacons IS
    'Authenticated creators may insert their own beacons, including metadata.image_url after a successful storage upload.';
