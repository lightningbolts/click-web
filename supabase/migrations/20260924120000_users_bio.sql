-- Short profile bio ("tagline") shown on the owner's profile and to connections.
-- Additive and nullable: clients that don't know the column keep working.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bio text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_bio_length;

ALTER TABLE public.users
  ADD CONSTRAINT users_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160);
