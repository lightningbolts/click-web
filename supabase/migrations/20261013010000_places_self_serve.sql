-- Click Places self-serve setup: a business (restaurant, event space, company…) submits its own
-- Place, which starts as 'pending' with the submitter as owner until a Click admin verifies it.
-- Two categories for organizations that weren't representable. Additive and idempotent.

ALTER TYPE public.place_category ADD VALUE IF NOT EXISTS 'event_space';
ALTER TYPE public.place_category ADD VALUE IF NOT EXISTS 'office';

CREATE INDEX IF NOT EXISTS idx_places_pending
    ON public.places (created_at)
    WHERE verification_status = 'pending';
