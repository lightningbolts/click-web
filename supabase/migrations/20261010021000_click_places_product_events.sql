-- Click Places telemetry (CLICK_PLACES_SPEC.md §10): allow the server-emitted Place events in
-- product_events. The original allowlist (20261006000000) is an inline CHECK, so without this
-- every Places emit would be rejected with 23514 and silently dropped by emitProductEvent.
-- Additive and idempotent: the constraint is recreated with the old names plus the new ones.

ALTER TABLE public.product_events DROP CONSTRAINT IF EXISTS product_events_event_check;

ALTER TABLE public.product_events ADD CONSTRAINT product_events_event_check CHECK (event IN (
    'install', 'app_open', 'day2_return', 'day7_return',
    'beacon_created', 'beacon_joined',
    'drop_posted', 'drop_ready_opened', 'recap_opened',
    'nudge_shown', 'nudge_acted',
    'place_viewed', 'place_check_in', 'place_check_in_rejected', 'place_pulse', 'place_hub_opened'
));
