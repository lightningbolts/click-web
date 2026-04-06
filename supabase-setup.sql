-- Click Supabase Setup Script
-- Run this in your Supabase SQL Editor

-- Create waitlist table
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT 'website',
  referrer_user_id UUID DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist(created_at);

-- Enable Row Level Security
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for waitlist signups)
CREATE POLICY "Anyone can join waitlist"
ON public.waitlist FOR INSERT
TO anon
WITH CHECK (true);

-- Only authenticated users can view (for admin dashboard)
CREATE POLICY "Authenticated users can view waitlist"
ON public.waitlist FOR SELECT
TO authenticated
USING (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT INSERT ON public.waitlist TO anon;
GRANT SELECT ON public.waitlist TO authenticated;

-- ─── Connections lifecycle (`status`) ────────────────────────────────────────
-- Mobile auto-archive sets `archived`; user removal sets `removed`.
-- Run on existing projects that already have `public.connections`.

DO $$ BEGIN
  CREATE TYPE public.connection_lifecycle_status AS ENUM (
    'pending',
    'active',
    'kept',
    'archived',
    'removed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS status public.connection_lifecycle_status;

COMMENT ON COLUMN public.connections.status IS
  'Lifecycle: pending → active/kept; auto-archived after inactivity; removed = soft delete for analytics.';

-- Default legacy rows to a sensible state (nullable column stays allowed for older clients).
UPDATE public.connections
SET status = 'pending'
WHERE status IS NULL AND COALESCE(has_begun, false) = false;

UPDATE public.connections
SET status = 'kept'
WHERE status IS NULL AND expiry_state = 'kept';

UPDATE public.connections
SET status = 'active'
WHERE status IS NULL AND COALESCE(has_begun, false) = true AND expiry_state IS DISTINCT FROM 'kept';

