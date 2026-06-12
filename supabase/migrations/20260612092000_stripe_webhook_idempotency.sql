-- Stripe webhook idempotency ledger. The webhook route inserts event ids before
-- handling; duplicate deliveries hit the primary-key conflict and are skipped.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_webhook_events IS
    'Processed Stripe webhook event ids (idempotency guard). Service role only.';

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_webhook_events FROM anon;
REVOKE ALL ON public.stripe_webhook_events FROM authenticated;

-- Optional retention: rows older than 30 days can be purged by the hourly
-- maintenance job; Stripe retries max out well inside that window.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
    ON public.stripe_webhook_events (received_at);
