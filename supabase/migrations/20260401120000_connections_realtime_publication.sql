-- Allow Supabase Realtime postgres_changes on public.connections so the web dashboard
-- can refetch when a new row is inserted (e.g. another user connects via web QR scan).
-- Idempotent: skip if already part of the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'connections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
  END IF;
END $$;
