-- Profile pictures: Storage bucket + RLS.
-- Without these policies, uploads fail with: "new row violates row-level security policy"
-- (Postgres is rejecting INSERT into storage.objects).

-- Bucket: public read so getPublicUrl() works from the app; uploads restricted per-user folder.
-- (Optional file size / MIME limits can be set in Dashboard → Storage → avatars.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own_prefix" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own_prefix" ON storage.objects;

-- Anyone can read objects in this bucket (URLs are effectively public).
CREATE POLICY "avatars_select_public"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- Authenticated users may only create objects whose path starts with their auth uid + "/".
CREATE POLICY "avatars_insert_own_prefix"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- Upsert / overwrite within own folder (same path prefix rule).
CREATE POLICY "avatars_update_own_prefix"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "avatars_delete_own_prefix"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
