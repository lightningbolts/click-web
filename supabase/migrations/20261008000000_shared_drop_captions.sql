-- Shared Click Drops get an optional Locket-style caption (100 characters as people count them;
-- the API enforces that, this is only a backstop). Shown with the photo once it develops.
-- Additive only.

ALTER TABLE public.shared_drops
    ADD COLUMN IF NOT EXISTS caption TEXT CHECK (caption IS NULL OR char_length(caption) BETWEEN 1 AND 1000);
