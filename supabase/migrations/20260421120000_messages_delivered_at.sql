-- Recipient device receipt: other participant sets this on the sender's row via gatekeeper PATCH.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivered_at bigint;

COMMENT ON COLUMN public.messages.delivered_at IS
  'Epoch ms when a recipient client acknowledged the message reached their device; null until ack.';
