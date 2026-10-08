-- Ticketing completion: free claims, organizer tier edits, event cancellation,
-- and the client-privilege fix for every ticketing function.
--
-- Builds on 20260919120000_ticketing_foundation.sql. Function signatures that
-- application code already calls are kept; bodies are replaced.

-- ---------------------------------------------------------------------------
-- 1. Admission: rsvp | ticketed (was free | paid). Free tickets are a
--    ticketed event whose tiers cost nothing, so "paid" no longer describes it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.map_beacons DROP CONSTRAINT IF EXISTS map_beacons_admission_type_check;

UPDATE public.map_beacons SET admission_type = 'rsvp' WHERE admission_type = 'free';
UPDATE public.map_beacons SET admission_type = 'ticketed' WHERE admission_type = 'paid';

ALTER TABLE public.map_beacons
    ALTER COLUMN admission_type SET DEFAULT 'rsvp',
    ADD CONSTRAINT map_beacons_admission_type_check CHECK (admission_type IN ('rsvp', 'ticketed'));

COMMENT ON COLUMN public.map_beacons.admission_type IS
    'rsvp keeps the RSVP flow; ticketed admits by ticket (free or paid tiers). Paid tiers need a payout-ready organizer account.';

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS event_cancelled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.map_beacons.event_cancelled_at IS
    'Set once by ticketing_cancel_event. Tickets stop admitting and paid orders are refunded by the app.';

-- ---------------------------------------------------------------------------
-- 2. Tiers can be archived (soft-deleted) once they have order history.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ticket_tiers
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_tiers_beacon_live
    ON public.ticket_tiers (beacon_id, sort_order)
    WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Free orders have no Stripe account behind them.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ticket_orders
    ALTER COLUMN organizer_payment_account_id DROP NOT NULL;

ALTER TABLE public.ticket_orders
    DROP CONSTRAINT IF EXISTS ticket_orders_paid_needs_account;
ALTER TABLE public.ticket_orders
    ADD CONSTRAINT ticket_orders_paid_needs_account
        CHECK (total_amount = 0 OR organizer_payment_account_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 4. Scan results for refunded tickets and cancelled events.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ticket_checkins DROP CONSTRAINT IF EXISTS ticket_checkins_result_check;
ALTER TABLE public.ticket_checkins
    ADD CONSTRAINT ticket_checkins_result_check CHECK (
        result IN ('accepted', 'already_checked_in', 'invalid', 'void', 'wrong_event', 'refunded', 'event_cancelled')
    );

-- ---------------------------------------------------------------------------
-- 5. Shared item validation (locks the requested tiers for the caller's
--    transaction). Used by reserve and claim.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_validate_items (
    p_buyer UUID,
    p_beacon UUID,
    p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_beacon RECORD;
    v_item RECORD;
    v_tier RECORD;
    v_sold INTEGER;
    v_held INTEGER;
    v_owned INTEGER;
    v_currency TEXT;
    v_subtotal INTEGER := 0;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_items');
    END IF;
    -- One line per tier: two lines for the same tier would each pass the
    -- capacity check on their own.
    IF (SELECT count(DISTINCT i->>'tier_id') FROM jsonb_array_elements(p_items) i) <> jsonb_array_length(p_items) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_items');
    END IF;

    SELECT id, beacon_type, admission_type, ticketing_status, event_cancelled_at,
           ticket_sales_start_at, ticket_sales_end_at
    INTO v_beacon
    FROM map_beacons
    WHERE id = p_beacon;

    IF NOT FOUND OR v_beacon.beacon_type <> 'event' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'event_not_found');
    END IF;
    IF v_beacon.event_cancelled_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'event_cancelled');
    END IF;
    IF v_beacon.admission_type <> 'ticketed' OR v_beacon.ticketing_status <> 'sales_open' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'sales_not_open');
    END IF;
    IF v_beacon.ticket_sales_start_at IS NOT NULL AND now() < v_beacon.ticket_sales_start_at THEN
        RETURN jsonb_build_object('ok', false, 'code', 'sales_not_started');
    END IF;
    IF v_beacon.ticket_sales_end_at IS NOT NULL AND now() > v_beacon.ticket_sales_end_at THEN
        RETURN jsonb_build_object('ok', false, 'code', 'sales_ended');
    END IF;

    -- Lock every requested tier in a stable order so concurrent buyers
    -- serialize instead of deadlocking.
    PERFORM 1
    FROM ticket_tiers t
    WHERE t.id IN (SELECT (i->>'tier_id')::uuid FROM jsonb_array_elements(p_items) i)
    ORDER BY t.id
    FOR UPDATE;

    FOR v_item IN
        SELECT (i->>'tier_id')::uuid AS tier_id,
               (i->>'quantity')::int AS quantity,
               (i->>'expected_unit_amount')::int AS expected_unit_amount
        FROM jsonb_array_elements(p_items) i
    LOOP
        IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
            RETURN jsonb_build_object('ok', false, 'code', 'invalid_items');
        END IF;

        SELECT * INTO v_tier FROM ticket_tiers WHERE id = v_item.tier_id;
        IF NOT FOUND OR v_tier.beacon_id <> p_beacon THEN
            RETURN jsonb_build_object('ok', false, 'code', 'tier_not_found');
        END IF;
        IF NOT v_tier.is_active OR v_tier.archived_at IS NOT NULL THEN
            RETURN jsonb_build_object('ok', false, 'code', 'tier_inactive');
        END IF;
        IF v_currency IS NULL THEN
            v_currency := v_tier.currency;
        ELSIF v_tier.currency <> v_currency THEN
            RETURN jsonb_build_object('ok', false, 'code', 'currency_mismatch');
        END IF;
        IF v_item.expected_unit_amount IS NULL OR v_tier.unit_amount <> v_item.expected_unit_amount THEN
            RETURN jsonb_build_object('ok', false, 'code', 'price_changed', 'tier_id', v_tier.id);
        END IF;
        IF v_tier.sales_start_at IS NOT NULL AND now() < v_tier.sales_start_at THEN
            RETURN jsonb_build_object('ok', false, 'code', 'sales_not_started', 'tier_id', v_tier.id);
        END IF;
        IF v_tier.sales_end_at IS NOT NULL AND now() > v_tier.sales_end_at THEN
            RETURN jsonb_build_object('ok', false, 'code', 'sales_ended', 'tier_id', v_tier.id);
        END IF;
        IF v_item.quantity > v_tier.max_per_order THEN
            RETURN jsonb_build_object('ok', false, 'code', 'over_order_limit', 'tier_id', v_tier.id);
        END IF;

        SELECT count(*) INTO v_sold
        FROM tickets tk
        WHERE tk.ticket_tier_id = v_tier.id AND tk.status IN ('valid', 'checked_in');

        SELECT COALESCE(sum(h.quantity), 0) INTO v_held
        FROM ticket_inventory_holds h
        WHERE h.ticket_tier_id = v_tier.id
          AND h.consumed_at IS NULL
          AND h.released_at IS NULL
          AND h.expires_at > now();

        IF v_sold + v_held + v_item.quantity > v_tier.capacity THEN
            RETURN jsonb_build_object(
                'ok', false,
                'code', 'insufficient_inventory',
                'tier_id', v_tier.id,
                'remaining', GREATEST(v_tier.capacity - v_sold - v_held, 0)
            );
        END IF;

        IF v_tier.max_per_user IS NOT NULL THEN
            SELECT count(*) INTO v_owned
            FROM tickets tk
            WHERE tk.ticket_tier_id = v_tier.id
              AND tk.owner_user_id = p_buyer
              AND tk.status IN ('valid', 'checked_in');
            IF v_owned + v_item.quantity > v_tier.max_per_user THEN
                RETURN jsonb_build_object('ok', false, 'code', 'over_user_limit', 'tier_id', v_tier.id);
            END IF;
        END IF;

        v_subtotal := v_subtotal + v_tier.unit_amount * v_item.quantity;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'subtotal', v_subtotal, 'currency', v_currency);
END;
$$;

COMMENT ON FUNCTION public.ticketing_validate_items IS
    'Validates event sales state, tier availability, price drift, capacity (sold + active holds) and per-user limits, holding row locks on the tiers for the caller''s transaction.';

-- ---------------------------------------------------------------------------
-- 6. Paid reservation (signature unchanged). Free selections must use
--    ticketing_claim_free so they never touch Stripe.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_reserve_order (
    p_buyer UUID,
    p_beacon UUID,
    p_items JSONB,
    p_currency TEXT,
    p_subtotal INTEGER,
    p_platform_fee INTEGER,
    p_total INTEGER,
    p_fee_policy JSONB,
    p_hold_minutes INTEGER DEFAULT 32
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_check JSONB;
    v_account RECORD;
    v_order_id UUID;
    v_expires TIMESTAMPTZ := now() + make_interval(mins => GREATEST(p_hold_minutes, 1));
BEGIN
    v_check := ticketing_validate_items(p_buyer, p_beacon, p_items);
    IF NOT (v_check->>'ok')::boolean THEN
        RETURN v_check;
    END IF;
    IF (v_check->>'subtotal')::int = 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'use_free_claim');
    END IF;
    IF v_check->>'currency' <> lower(p_currency) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'currency_mismatch');
    END IF;

    SELECT a.id, a.onboarding_state, a.transfers_enabled
    INTO v_account
    FROM map_beacons b
    JOIN organizer_payment_accounts a ON a.id = b.organizer_payment_account_id
    WHERE b.id = p_beacon;

    IF NOT FOUND OR v_account.onboarding_state <> 'ready' OR NOT v_account.transfers_enabled THEN
        RETURN jsonb_build_object('ok', false, 'code', 'organizer_not_ready');
    END IF;

    IF (v_check->>'subtotal')::int <> p_subtotal OR p_total <> p_subtotal OR p_platform_fee > p_subtotal THEN
        RETURN jsonb_build_object('ok', false, 'code', 'pricing_mismatch');
    END IF;

    INSERT INTO ticket_orders (
        beacon_id, buyer_user_id, organizer_payment_account_id,
        currency, subtotal_amount, platform_fee_amount, total_amount,
        fee_policy_snapshot, order_state
    ) VALUES (
        p_beacon, p_buyer, v_account.id,
        lower(p_currency), p_subtotal, p_platform_fee, p_total,
        p_fee_policy, 'reserved'
    )
    RETURNING id INTO v_order_id;

    INSERT INTO ticket_order_items (order_id, ticket_tier_id, quantity, unit_amount, subtotal_amount, tier_name_snapshot)
    SELECT v_order_id, t.id, (i->>'quantity')::int, t.unit_amount, t.unit_amount * (i->>'quantity')::int, t.name
    FROM jsonb_array_elements(p_items) i
    JOIN ticket_tiers t ON t.id = (i->>'tier_id')::uuid;

    INSERT INTO ticket_inventory_holds (order_id, ticket_tier_id, quantity, expires_at)
    SELECT v_order_id, (i->>'tier_id')::uuid, (i->>'quantity')::int, v_expires
    FROM jsonb_array_elements(p_items) i;

    RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'hold_expires_at', v_expires);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Free claim: validate, record a $0 order and mint tickets in one
--    transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_claim_free (
    p_buyer UUID,
    p_beacon UUID,
    p_items JSONB,
    p_tickets JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_check JSONB;
    v_order_id UUID;
    v_ticket_ids UUID[];
BEGIN
    v_check := ticketing_validate_items(p_buyer, p_beacon, p_items);
    IF NOT (v_check->>'ok')::boolean THEN
        RETURN v_check;
    END IF;
    IF (v_check->>'subtotal')::int <> 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'not_free');
    END IF;

    -- The minted tickets must match the requested quantities tier by tier.
    IF p_tickets IS NULL OR jsonb_typeof(p_tickets) <> 'array' OR EXISTS (
        SELECT 1
        FROM (SELECT (i->>'tier_id')::uuid AS tier_id, (i->>'quantity')::int AS quantity
              FROM jsonb_array_elements(p_items) i) want
        FULL JOIN (SELECT (t->>'tier_id')::uuid AS tier_id, count(*)::int AS quantity
                   FROM jsonb_array_elements(p_tickets) t GROUP BY 1) got USING (tier_id)
        WHERE want.quantity IS DISTINCT FROM got.quantity
    ) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_tickets');
    END IF;

    INSERT INTO ticket_orders (
        beacon_id, buyer_user_id, organizer_payment_account_id,
        currency, subtotal_amount, platform_fee_amount, total_amount,
        fee_policy_snapshot, order_state, fulfillment_state, paid_at
    ) VALUES (
        p_beacon, p_buyer, NULL,
        v_check->>'currency', 0, 0, 0,
        '{}'::jsonb, 'paid', 'fulfilled', now()
    )
    RETURNING id INTO v_order_id;

    INSERT INTO ticket_order_items (order_id, ticket_tier_id, quantity, unit_amount, subtotal_amount, tier_name_snapshot)
    SELECT v_order_id, t.id, (i->>'quantity')::int, 0, 0, t.name
    FROM jsonb_array_elements(p_items) i
    JOIN ticket_tiers t ON t.id = (i->>'tier_id')::uuid;

    INSERT INTO tickets (id, beacon_id, order_id, ticket_tier_id, owner_user_id, ordinal, ticket_number, qr_token_hash)
    SELECT (t->>'id')::uuid, p_beacon, v_order_id, (t->>'tier_id')::uuid, p_buyer,
           (t->>'ordinal')::int, t->>'ticket_number', t->>'token_hash'
    FROM jsonb_array_elements(p_tickets) t;

    SELECT array_agg(id ORDER BY ordinal) INTO v_ticket_ids FROM tickets WHERE order_id = v_order_id;

    INSERT INTO beacon_attendees (beacon_id, user_id, source)
    VALUES (p_beacon, p_buyer, 'ticket')
    ON CONFLICT (beacon_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'ticket_ids', to_jsonb(v_ticket_ids));
END;
$$;

COMMENT ON FUNCTION public.ticketing_claim_free IS
    'Free tickets: validates under tier locks, records a fulfilled $0 order with no payout account, mints the supplied tickets and marks the buyer going.';

-- ---------------------------------------------------------------------------
-- 8. Fulfillment (signature unchanged): ticket ids now come from the app so
--    the QR credential (which embeds the id) can be derived before insert.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_fulfill_order (
    p_order UUID,
    p_payment_intent TEXT,
    p_charge TEXT,
    p_amount INTEGER,
    p_currency TEXT,
    p_tickets JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_ticket_ids UUID[];
BEGIN
    SELECT * INTO v_order FROM ticket_orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
    END IF;

    IF v_order.order_state = 'paid' AND v_order.fulfillment_state = 'fulfilled' THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;

    IF v_order.order_state NOT IN ('reserved', 'checkout_created', 'payment_processing', 'paid') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'order_not_payable', 'order_state', v_order.order_state);
    END IF;

    IF p_amount <> v_order.total_amount OR lower(p_currency) <> v_order.currency THEN
        RETURN jsonb_build_object('ok', false, 'code', 'amount_mismatch');
    END IF;

    IF jsonb_typeof(p_tickets) <> 'array' OR jsonb_array_length(p_tickets) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_tickets');
    END IF;

    UPDATE ticket_orders
    SET order_state = 'paid',
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, p_payment_intent),
        stripe_charge_id = COALESCE(stripe_charge_id, p_charge),
        paid_at = COALESCE(paid_at, now()),
        updated_at = now()
    WHERE id = p_order;

    UPDATE ticket_inventory_holds
    SET consumed_at = now()
    WHERE order_id = p_order AND consumed_at IS NULL AND released_at IS NULL;

    INSERT INTO tickets (id, beacon_id, order_id, ticket_tier_id, owner_user_id, ordinal, ticket_number, qr_token_hash)
    SELECT COALESCE((t->>'id')::uuid, gen_random_uuid()),
           v_order.beacon_id,
           p_order,
           (t->>'tier_id')::uuid,
           v_order.buyer_user_id,
           (t->>'ordinal')::int,
           t->>'ticket_number',
           t->>'token_hash'
    FROM jsonb_array_elements(p_tickets) t
    ON CONFLICT (order_id, ordinal) DO NOTHING;

    SELECT array_agg(id ORDER BY ordinal) INTO v_ticket_ids FROM tickets WHERE order_id = p_order;

    UPDATE ticket_orders
    SET fulfillment_state = 'fulfilled', updated_at = now()
    WHERE id = p_order;

    INSERT INTO beacon_attendees (beacon_id, user_id, source)
    VALUES (v_order.beacon_id, v_order.buyer_user_id, 'ticket')
    ON CONFLICT (beacon_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'ticket_ids', to_jsonb(v_ticket_ids));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Organizer tier edits under the tier lock.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_update_tier (
    p_tier UUID,
    p_patch JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tier RECORD;
    v_taken INTEGER;
    v_capacity INTEGER;
    v_amount INTEGER;
    v_start TIMESTAMPTZ;
    v_end TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_tier FROM ticket_tiers WHERE id = p_tier FOR UPDATE;
    IF NOT FOUND OR v_tier.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'tier_not_found');
    END IF;

    v_capacity := CASE WHEN p_patch ? 'capacity' THEN (p_patch->>'capacity')::int ELSE v_tier.capacity END;
    v_amount := CASE WHEN p_patch ? 'unit_amount' THEN (p_patch->>'unit_amount')::int ELSE v_tier.unit_amount END;
    v_start := CASE WHEN p_patch ? 'sales_start_at' THEN (p_patch->>'sales_start_at')::timestamptz ELSE v_tier.sales_start_at END;
    v_end := CASE WHEN p_patch ? 'sales_end_at' THEN (p_patch->>'sales_end_at')::timestamptz ELSE v_tier.sales_end_at END;

    IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end <= v_start THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_window');
    END IF;

    -- Sold tickets and live checkout holds both count: lowering capacity
    -- under an open checkout would oversell once it is paid.
    SELECT count(*) INTO v_taken
    FROM tickets WHERE ticket_tier_id = p_tier AND status IN ('valid', 'checked_in');
    SELECT v_taken + COALESCE(sum(quantity), 0) INTO v_taken
    FROM ticket_inventory_holds
    WHERE ticket_tier_id = p_tier AND consumed_at IS NULL AND released_at IS NULL AND expires_at > now();

    IF v_capacity < v_taken THEN
        RETURN jsonb_build_object('ok', false, 'code', 'capacity_below_sold', 'sold', v_taken);
    END IF;

    -- Free and paid orders take different paths (no Stripe vs Stripe), so a
    -- tier with any order history keeps its kind.
    IF (v_amount = 0) <> (v_tier.unit_amount = 0)
       AND EXISTS (SELECT 1 FROM ticket_order_items WHERE ticket_tier_id = p_tier) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'price_kind_locked');
    END IF;

    UPDATE ticket_tiers
    SET name = CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE name END,
        description = CASE WHEN p_patch ? 'description' THEN p_patch->>'description' ELSE description END,
        unit_amount = v_amount,
        capacity = v_capacity,
        max_per_order = CASE WHEN p_patch ? 'max_per_order' THEN (p_patch->>'max_per_order')::int ELSE max_per_order END,
        max_per_user = CASE WHEN p_patch ? 'max_per_user' THEN (p_patch->>'max_per_user')::int ELSE max_per_user END,
        sales_start_at = v_start,
        sales_end_at = v_end,
        sort_order = CASE WHEN p_patch ? 'sort_order' THEN (p_patch->>'sort_order')::int ELSE sort_order END,
        is_active = CASE WHEN p_patch ? 'is_active' THEN (p_patch->>'is_active')::boolean ELSE is_active END,
        updated_at = now()
    WHERE id = p_tier;

    RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.ticketing_update_tier IS
    'Applies an organizer patch to a tier under its row lock, refusing capacity below sold + held, free/paid switches after orders, and inverted sales windows.';

-- ---------------------------------------------------------------------------
-- 10. Cancel an event. Database side only: the app refunds the returned
--     paid orders through Stripe (and the cron retries failures).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_cancel_event (
    p_beacon UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_refund_ids UUID[];
BEGIN
    PERFORM 1 FROM map_beacons WHERE id = p_beacon AND beacon_type = 'event' FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'event_not_found');
    END IF;

    UPDATE map_beacons
    SET event_cancelled_at = COALESCE(event_cancelled_at, now()),
        ticketing_status = CASE WHEN ticketing_status = 'disabled' THEN ticketing_status ELSE 'sales_closed' END
    WHERE id = p_beacon;

    -- Open checkouts end now and release their holds.
    FOR v_order_id IN
        SELECT id FROM ticket_orders
        WHERE beacon_id = p_beacon AND order_state IN ('reserved', 'checkout_created')
    LOOP
        PERFORM ticketing_cancel_order(v_order_id, 'canceled');
    END LOOP;

    -- Free tickets have nothing to refund: void them with their orders.
    UPDATE tickets tk
    SET status = 'void', voided_at = COALESCE(tk.voided_at, now())
    FROM ticket_orders o
    WHERE o.id = tk.order_id
      AND o.beacon_id = p_beacon
      AND o.total_amount = 0
      AND tk.status IN ('valid', 'checked_in');

    UPDATE ticket_orders
    SET order_state = 'canceled', fulfillment_state = 'voided', updated_at = now()
    WHERE beacon_id = p_beacon AND total_amount = 0 AND order_state = 'paid';

    DELETE FROM beacon_attendees ba
    WHERE ba.beacon_id = p_beacon
      AND ba.source = 'ticket'
      AND NOT EXISTS (
          SELECT 1 FROM tickets tk
          WHERE tk.beacon_id = p_beacon
            AND tk.owner_user_id = ba.user_id
            AND tk.status IN ('valid', 'checked_in')
      );

    SELECT COALESCE(array_agg(id ORDER BY created_at, id), '{}') INTO v_refund_ids
    FROM ticket_orders
    WHERE beacon_id = p_beacon
      AND total_amount > 0
      AND order_state IN ('paid', 'partially_refunded');

    RETURN jsonb_build_object('ok', true, 'refund_order_ids', to_jsonb(v_refund_ids));
END;
$$;

COMMENT ON FUNCTION public.ticketing_cancel_event IS
    'Idempotently marks an event cancelled, closes sales, cancels open checkouts, voids free tickets, and returns the paid orders still owed a refund.';

-- ---------------------------------------------------------------------------
-- 11. Check-in (signature unchanged) with refunded / cancelled results.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_check_in (
    p_beacon UUID,
    p_token_hash TEXT,
    p_scanner UUID,
    p_device JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket RECORD;
    v_result TEXT;
    v_attendee RECORD;
    v_tier_name TEXT;
    v_cancelled BOOLEAN;
BEGIN
    SELECT * INTO v_ticket
    FROM tickets
    WHERE qr_token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'result', 'invalid');
    END IF;

    SELECT event_cancelled_at IS NOT NULL INTO v_cancelled FROM map_beacons WHERE id = v_ticket.beacon_id;

    IF v_ticket.beacon_id <> p_beacon THEN
        v_result := 'wrong_event';
    ELSIF v_ticket.status = 'refunded' THEN
        v_result := 'refunded';
    ELSIF v_cancelled THEN
        v_result := 'event_cancelled';
    ELSIF v_ticket.status = 'valid' THEN
        v_result := 'accepted';
        UPDATE tickets
        SET status = 'checked_in', checked_in_at = now()
        WHERE id = v_ticket.id;
    ELSIF v_ticket.status = 'checked_in' THEN
        v_result := 'already_checked_in';
    ELSE
        v_result := 'void';
    END IF;

    INSERT INTO ticket_checkins (ticket_id, beacon_id, scanned_by_user_id, result, device_metadata)
    VALUES (v_ticket.id, p_beacon, p_scanner, v_result, p_device);

    SELECT u.name, u.image INTO v_attendee FROM users u WHERE u.id = v_ticket.owner_user_id;
    SELECT t.name INTO v_tier_name FROM ticket_tiers t WHERE t.id = v_ticket.ticket_tier_id;

    RETURN jsonb_build_object(
        'ok', true,
        'result', v_result,
        'ticket_id', v_ticket.id,
        'owner_user_id', v_ticket.owner_user_id,
        'ticket_number', v_ticket.ticket_number,
        'tier_name', v_tier_name,
        'attendee_name', v_attendee.name,
        'attendee_image', v_attendee.image,
        'checked_in_at', COALESCE(v_ticket.checked_in_at, now())
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Per-tier counts for availability and the organizer dashboard.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_tier_counts (
    p_beacon UUID
) RETURNS TABLE (tier_id UUID, sold INTEGER, held INTEGER, checked_in INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT t.id,
           (SELECT count(*)::int FROM tickets tk
            WHERE tk.ticket_tier_id = t.id AND tk.status IN ('valid', 'checked_in')),
           (SELECT COALESCE(sum(h.quantity), 0)::int FROM ticket_inventory_holds h
            WHERE h.ticket_tier_id = t.id AND h.consumed_at IS NULL
              AND h.released_at IS NULL AND h.expires_at > now()),
           (SELECT count(*)::int FROM tickets tk
            WHERE tk.ticket_tier_id = t.id AND tk.status = 'checked_in')
    FROM ticket_tiers t
    WHERE t.beacon_id = p_beacon AND t.archived_at IS NULL;
$$;

COMMENT ON FUNCTION public.ticketing_tier_counts IS
    'Sold (live tickets), held (active checkout holds) and checked-in counts for each unarchived tier of an event.';

-- ---------------------------------------------------------------------------
-- 13. Privileges. Supabase grants EXECUTE on new public functions to anon and
--     authenticated by default, so REVOKE ... FROM PUBLIC alone left every
--     ticketing function callable by clients. Only the service role may call
--     them.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.ticketing_validate_items (UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_reserve_order (UUID, UUID, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_claim_free (UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_fulfill_order (UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_update_tier (UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_cancel_event (UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_check_in (UUID, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_tier_counts (UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_cancel_order (UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_expire_stale () FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_apply_refund (UUID, TEXT, INTEGER, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ticketing_mark_disputed (UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ticketing_validate_items (UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_reserve_order (UUID, UUID, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_claim_free (UUID, UUID, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_fulfill_order (UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_update_tier (UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_cancel_event (UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_check_in (UUID, TEXT, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_tier_counts (UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_cancel_order (UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_expire_stale () TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_apply_refund (UUID, TEXT, INTEGER, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.ticketing_mark_disputed (UUID) TO service_role;
