BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, pg_temp;
SELECT plan(39);

-- Fixtures: a host, two buyers, one ticketed event with a free tier (capacity 2), a paid tier,
-- and an archived free tier.
INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-4000-8000-0000000a0001', 'tix-host@example.test'),
    ('00000000-0000-4000-8000-0000000a0002', 'tix-buyer-b@example.test'),
    ('00000000-0000-4000-8000-0000000a0003', 'tix-buyer-c@example.test');

INSERT INTO public.map_beacons (id, creator_id, beacon_type, location, expires_at)
VALUES ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-0000000a0001', 'event',
        'SRID=4326;POINT(-122.3 47.65)', now() + interval '2 days');

SELECT is(
    (SELECT admission_type FROM public.map_beacons WHERE id = '00000000-0000-4000-8000-0000000b0001'),
    'rsvp',
    'new events default to RSVP admission'
);
SELECT is(
    (SELECT count(*)::int FROM public.map_beacons WHERE admission_type NOT IN ('rsvp', 'ticketed')),
    0,
    'every existing event has a renamed admission value'
);
SELECT throws_ok(
    $$UPDATE public.map_beacons SET admission_type = 'paid' WHERE id = '00000000-0000-4000-8000-0000000b0001'$$,
    '23514',
    NULL,
    'the old paid value is rejected'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'ticketing\_%'
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ),
    'clients cannot execute any ticketing function'
);
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'ticketing_claim_free'
          AND has_function_privilege('service_role', p.oid, 'EXECUTE')
    ),
    'the service role can claim free tickets'
);

UPDATE public.map_beacons
SET admission_type = 'ticketed', ticketing_status = 'sales_open'
WHERE id = '00000000-0000-4000-8000-0000000b0001';

INSERT INTO public.ticket_tiers (id, beacon_id, name, unit_amount, capacity, max_per_order, sort_order) VALUES
    ('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000b0001', 'Free entry', 0, 2, 8, 0),
    ('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000b0001', 'General', 1500, 10, 8, 1),
    ('00000000-0000-4000-8000-0000000c0004', '00000000-0000-4000-8000-0000000b0001', 'Free overflow', 0, 10, 8, 2);
INSERT INTO public.ticket_tiers (id, beacon_id, name, unit_amount, capacity, archived_at, is_active) VALUES
    ('00000000-0000-4000-8000-0000000c0003', '00000000-0000-4000-8000-0000000b0001', 'Old', 0, 10, now(), false);

-- Free claims ---------------------------------------------------------------

SELECT is(
    (public.ticketing_claim_free(
        '00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-0000000b0001',
        '[{"tier_id":"00000000-0000-4000-8000-0000000c0001","quantity":2,"expected_unit_amount":0}]',
        '[{"id":"00000000-0000-4000-8000-0000000d0001","tier_id":"00000000-0000-4000-8000-0000000c0001","ordinal":1,"ticket_number":"CLK-FREE1-AAAAA","token_hash":"hash-free-1"},
          {"id":"00000000-0000-4000-8000-0000000d0002","tier_id":"00000000-0000-4000-8000-0000000c0001","ordinal":2,"ticket_number":"CLK-FREE2-AAAAA","token_hash":"hash-free-2"}]'
    ))->>'ok',
    'true',
    'two free tickets are claimed'
);
SELECT is(
    (SELECT count(*)::int FROM public.tickets
     WHERE owner_user_id = '00000000-0000-4000-8000-0000000a0002' AND status = 'valid'
       AND id IN ('00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000d0002')),
    2,
    'claimed tickets are valid and keep the supplied ids'
);

-- Attendee search ------------------------------------------------------------

-- Production has these columns; a clean migration chain doesn't (rolled back with the test).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS first_name TEXT, ADD COLUMN IF NOT EXISTS last_name TEXT;
INSERT INTO public.users (id, first_name, last_name) VALUES
    ('00000000-0000-4000-8000-0000000a0002', 'Ada', 'Lovelace_x')
ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name;

SELECT is(
    (SELECT count(*)::int FROM public.ticketing_search_attendees(
        '00000000-0000-4000-8000-0000000b0001', 'ada love', NULL, NULL, 50)),
    2,
    'attendees are found by full name, case-insensitively'
);
SELECT is(
    (SELECT array_agg(ticket_id ORDER BY issued_at, ticket_id)::text FROM public.ticketing_search_attendees(
        '00000000-0000-4000-8000-0000000b0001', ' clk-free1-aaaaa ', NULL, NULL, 50)),
    '{00000000-0000-4000-8000-0000000d0001}',
    'a ticket number matches exactly, ignoring case and spaces'
);
SELECT is(
    (SELECT count(*)::int FROM public.ticketing_search_attendees(
        '00000000-0000-4000-8000-0000000b0001', '%', NULL, NULL, 50)),
    0,
    'LIKE wildcards in the query are literal'
);
SELECT is(
    (SELECT count(*)::int FROM public.ticketing_search_attendees(
        '00000000-0000-4000-8000-0000000b0001', 'e_x', NULL, NULL, 50)),
    2,
    'an underscore matches only itself'
);
SELECT is(
    (WITH first_page AS (
        SELECT * FROM public.ticketing_search_attendees('00000000-0000-4000-8000-0000000b0001', '', NULL, NULL, 1)
     )
     SELECT count(*)::int FROM first_page f,
         public.ticketing_search_attendees('00000000-0000-4000-8000-0000000b0001', '', f.issued_at, f.ticket_id, 50) n
     WHERE n.ticket_id = f.ticket_id),
    0,
    'the next page starts after the cursor row'
);
SELECT is(
    (SELECT order_state || '/' || fulfillment_state || '/' || total_amount || '/' || (organizer_payment_account_id IS NULL)::text
     FROM public.ticket_orders WHERE buyer_user_id = '00000000-0000-4000-8000-0000000a0002'),
    'paid/fulfilled/0/true',
    'a free order is paid and fulfilled with no payout account'
);
SELECT is(
    (SELECT source FROM public.beacon_attendees
     WHERE beacon_id = '00000000-0000-4000-8000-0000000b0001' AND user_id = '00000000-0000-4000-8000-0000000a0002'),
    'ticket',
    'claiming makes the buyer going via their ticket'
);
SELECT is(
    (public.ticketing_claim_free(
        '00000000-0000-4000-8000-0000000a0003', '00000000-0000-4000-8000-0000000b0001',
        '[{"tier_id":"00000000-0000-4000-8000-0000000c0001","quantity":1,"expected_unit_amount":0}]',
        '[{"id":"00000000-0000-4000-8000-0000000d0003","tier_id":"00000000-0000-4000-8000-0000000c0001","ordinal":1,"ticket_number":"CLK-FREE3-AAAAA","token_hash":"hash-free-3"}]'
    ))->>'code',
    'insufficient_inventory',
    'free tickets cannot oversell'
);
SELECT is(
    (public.ticketing_claim_free(
        '00000000-0000-4000-8000-0000000a0003', '00000000-0000-4000-8000-0000000b0001',
        '[{"tier_id":"00000000-0000-4000-8000-0000000c0002","quantity":1,"expected_unit_amount":1500}]',
        '[{"id":"00000000-0000-4000-8000-0000000d0004","tier_id":"00000000-0000-4000-8000-0000000c0002","ordinal":1,"ticket_number":"CLK-PAID0-AAAAA","token_hash":"hash-x"}]'
    ))->>'code',
    'not_free',
    'paid tiers cannot be claimed for free'
);
SELECT is(
    (public.ticketing_claim_free(
        '00000000-0000-4000-8000-0000000a0003', '00000000-0000-4000-8000-0000000b0001',
        '[{"tier_id":"00000000-0000-4000-8000-0000000c0003","quantity":1,"expected_unit_amount":0}]',
        '[{"id":"00000000-0000-4000-8000-0000000d0005","tier_id":"00000000-0000-4000-8000-0000000c0003","ordinal":1,"ticket_number":"CLK-OLD00-AAAAA","token_hash":"hash-y"}]'
    ))->>'code',
    'tier_inactive',
    'archived tiers are not sellable'
);

-- Paid reservations -----------------------------------------------------------

SELECT is(
    (public.ticketing_reserve_order(
        '00000000-0000-4000-8000-0000000a0003', '00000000-0000-4000-8000-0000000b0001',
        '[{"tier_id":"00000000-0000-4000-8000-0000000c0002","quantity":1,"expected_unit_amount":1500}]',
        'usd', 1500, 75, 1500, '{"version":1}'
    ))->>'code',
    'organizer_not_ready',
    'paid tickets need a payout-ready organizer'
);
SELECT is(
    (public.ticketing_reserve_order(
        '00000000-0000-4000-8000-0000000a0003', '00000000-0000-4000-8000-0000000b0001',
        '[{"tier_id":"00000000-0000-4000-8000-0000000c0004","quantity":1,"expected_unit_amount":0}]',
        'usd', 0, 0, 0, '{"version":1}'
    ))->>'code',
    'use_free_claim',
    'free tiers go through the claim path, not Stripe'
);

INSERT INTO public.organizer_payment_accounts (id, owner_user_id, stripe_account_id, onboarding_state, transfers_enabled, charges_enabled, payouts_enabled)
VALUES ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000a0001', 'acct_test_tix', 'ready', true, true, true);
UPDATE public.map_beacons SET organizer_payment_account_id = '00000000-0000-4000-8000-0000000e0001'
WHERE id = '00000000-0000-4000-8000-0000000b0001';

CREATE TEMP TABLE tix_paid AS
SELECT public.ticketing_reserve_order(
    '00000000-0000-4000-8000-0000000a0003', '00000000-0000-4000-8000-0000000b0001',
    '[{"tier_id":"00000000-0000-4000-8000-0000000c0002","quantity":3,"expected_unit_amount":1500}]',
    'usd', 4500, 225, 4500, '{"version":1}'
) AS r;
SELECT is((SELECT r->>'ok' FROM tix_paid), 'true', 'a paid reservation succeeds once payouts are ready');

SELECT is(
    (public.ticketing_fulfill_order(
        ((SELECT r->>'order_id' FROM tix_paid))::uuid, 'pi_test_1', 'ch_test_1', 4500, 'usd',
        '[{"id":"00000000-0000-4000-8000-0000000f0001","tier_id":"00000000-0000-4000-8000-0000000c0002","ordinal":1,"ticket_number":"CLK-PAID1-AAAAA","token_hash":"hash-paid-1"},
          {"id":"00000000-0000-4000-8000-0000000f0002","tier_id":"00000000-0000-4000-8000-0000000c0002","ordinal":2,"ticket_number":"CLK-PAID2-AAAAA","token_hash":"hash-paid-2"},
          {"id":"00000000-0000-4000-8000-0000000f0003","tier_id":"00000000-0000-4000-8000-0000000c0002","ordinal":3,"ticket_number":"CLK-PAID3-AAAAA","token_hash":"hash-paid-3"}]'
    ))->>'ok',
    'true',
    'fulfillment mints the paid tickets'
);
SELECT is(
    (SELECT count(*)::int FROM public.tickets WHERE id IN (
        '00000000-0000-4000-8000-0000000f0001', '00000000-0000-4000-8000-0000000f0002', '00000000-0000-4000-8000-0000000f0003')),
    3,
    'fulfillment stores the server-chosen ticket ids'
);
SELECT is(
    (public.ticketing_fulfill_order(
        ((SELECT r->>'order_id' FROM tix_paid))::uuid, 'pi_test_1', 'ch_test_1', 4500, 'usd',
        '[{"id":"00000000-0000-4000-8000-0000000f0009","tier_id":"00000000-0000-4000-8000-0000000c0002","ordinal":1,"ticket_number":"CLK-PAID9-AAAAA","token_hash":"hash-paid-9"}]'
    ))->>'idempotent',
    'true',
    'a duplicate fulfillment is a no-op'
);

-- Tier edits ------------------------------------------------------------------

SELECT is(
    (public.ticketing_update_tier('00000000-0000-4000-8000-0000000c0001', '{"capacity":1}'))->>'code',
    'capacity_below_sold',
    'capacity cannot drop below what is sold'
);
SELECT is(
    (public.ticketing_update_tier('00000000-0000-4000-8000-0000000c0001', '{"unit_amount":500}'))->>'code',
    'price_kind_locked',
    'a free tier with sales cannot become paid'
);
SELECT is(
    (public.ticketing_update_tier('00000000-0000-4000-8000-0000000c0002', '{"unit_amount":2000,"name":"GA"}'))->>'ok',
    'true',
    'a paid tier can change price and name'
);
SELECT is(
    (SELECT tier_name_snapshot || ':' || unit_amount FROM public.ticket_order_items
     WHERE order_id = ((SELECT r->>'order_id' FROM tix_paid))::uuid),
    'General:1500',
    'order history keeps the name and price it was sold at'
);
SELECT is(
    (public.ticketing_update_tier('00000000-0000-4000-8000-0000000c0002', '{"sales_start_at":"2030-01-02T00:00:00Z","sales_end_at":"2030-01-01T00:00:00Z"}'))->>'code',
    'invalid_window',
    'sales must end after they start'
);
SELECT results_eq(
    $$SELECT tier_id, sold, held, checked_in FROM public.ticketing_tier_counts('00000000-0000-4000-8000-0000000b0001') ORDER BY tier_id$$,
    $$VALUES ('00000000-0000-4000-8000-0000000c0001'::uuid, 2, 0, 0), ('00000000-0000-4000-8000-0000000c0002'::uuid, 3, 0, 0),
             ('00000000-0000-4000-8000-0000000c0004'::uuid, 0, 0, 0)$$,
    'tier counts report sold and held per tier'
);

-- Check-in --------------------------------------------------------------------

SELECT is(
    (public.ticketing_check_in('00000000-0000-4000-8000-0000000b0001', 'hash-paid-1', '00000000-0000-4000-8000-0000000a0001'))->>'result',
    'accepted',
    'a valid ticket checks in'
);
SELECT is(
    (public.ticketing_check_in('00000000-0000-4000-8000-0000000b0001', 'hash-paid-1', '00000000-0000-4000-8000-0000000a0001'))->>'result',
    'already_checked_in',
    'a second scan is caught'
);

SELECT public.ticketing_apply_refund(
    ((SELECT r->>'order_id' FROM tix_paid))::uuid, 're_test_1', 1500, 'succeeded',
    ARRAY['00000000-0000-4000-8000-0000000f0002']::uuid[]
);
SELECT is(
    (public.ticketing_check_in('00000000-0000-4000-8000-0000000b0001', 'hash-paid-2', '00000000-0000-4000-8000-0000000a0001'))->>'result',
    'refunded',
    'a refunded ticket is rejected as refunded'
);

-- Cancelling the event ----------------------------------------------------------

CREATE TEMP TABLE tix_pending AS
SELECT public.ticketing_reserve_order(
    '00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-0000000b0001',
    '[{"tier_id":"00000000-0000-4000-8000-0000000c0002","quantity":1,"expected_unit_amount":2000}]',
    'usd', 2000, 100, 2000, '{"version":1}'
) AS r;

CREATE TEMP TABLE tix_cancel AS
SELECT public.ticketing_cancel_event('00000000-0000-4000-8000-0000000b0001') AS r;

SELECT is(
    (SELECT r->'refund_order_ids' FROM tix_cancel),
    jsonb_build_array((SELECT r->>'order_id' FROM tix_paid)),
    'cancelling returns the paid orders that need refunds'
);
SELECT is(
    (SELECT ticketing_status || '/' || (event_cancelled_at IS NOT NULL)::text FROM public.map_beacons
     WHERE id = '00000000-0000-4000-8000-0000000b0001'),
    'sales_closed/true',
    'the event is marked cancelled and sales close'
);
SELECT is(
    (SELECT count(*)::int FROM public.tickets
     WHERE id IN ('00000000-0000-4000-8000-0000000d0001', '00000000-0000-4000-8000-0000000d0002') AND status = 'void'),
    2,
    'free tickets are voided'
);
SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM public.beacon_attendees
        WHERE beacon_id = '00000000-0000-4000-8000-0000000b0001' AND user_id = '00000000-0000-4000-8000-0000000a0002'
    ),
    'ticket-sourced attendance for voided tickets is removed'
);
SELECT is(
    (SELECT o.order_state || '/' || (SELECT count(*) FROM public.ticket_inventory_holds h
                                     WHERE h.order_id = o.id AND h.released_at IS NULL)::text
     FROM public.ticket_orders o WHERE o.id = ((SELECT r->>'order_id' FROM tix_pending))::uuid),
    'canceled/0',
    'open reservations are cancelled and their holds released'
);
SELECT is(
    (public.ticketing_check_in('00000000-0000-4000-8000-0000000b0001', 'hash-paid-3', '00000000-0000-4000-8000-0000000a0001'))->>'result',
    'event_cancelled',
    'a still-valid paid ticket is rejected once the event is cancelled'
);
SELECT is(
    public.ticketing_cancel_event('00000000-0000-4000-8000-0000000b0001'),
    (SELECT r FROM tix_cancel),
    'cancelling again is idempotent'
);

SELECT * FROM finish();
ROLLBACK;
