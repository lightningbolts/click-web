-- Ticketed events via Stripe Connect (destination charges) — foundation schema.
-- Additive only: every existing event stays admission_type='free' /
-- ticketing_status='disabled', so this migration is behaviorally inert for the
-- current app. PostgreSQL is the product source of truth (orders, tickets,
-- admission); Stripe is the source of truth for external money movement.
-- All monetary amounts are integer minor units (cents). Financial writes are
-- service-role only; attendees/organizers get read-only projections via RLS.

-- ---------------------------------------------------------------------------
-- 1. Organizer payout accounts (Stripe Connect connected accounts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizer_payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    owner_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

    stripe_account_id TEXT NOT NULL UNIQUE,
    livemode BOOLEAN NOT NULL DEFAULT false,

    onboarding_state TEXT NOT NULL DEFAULT 'not_started' CHECK (
        onboarding_state IN (
            'not_started',
            'in_progress',
            'restricted',
            'ready',
            'disabled'
        )
    ),

    charges_enabled BOOLEAN NOT NULL DEFAULT false,
    payouts_enabled BOOLEAN NOT NULL DEFAULT false,
    transfers_enabled BOOLEAN NOT NULL DEFAULT false,
    details_submitted BOOLEAN NOT NULL DEFAULT false,

    requirements_currently_due_count INTEGER NOT NULL DEFAULT 0,
    requirements_eventually_due_count INTEGER NOT NULL DEFAULT 0,
    requirements_disabled_reason TEXT NULL,

    last_stripe_sync_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- v1: one payout account per organizer principal.
    UNIQUE (owner_user_id)
);

COMMENT ON TABLE public.organizer_payment_accounts IS
    'Normalized readiness of an organizer''s Stripe Connect account. Stripe holds the detailed verification state; Click stores only enough to gate paid-event publication. Never store bank numbers here.';

COMMENT ON COLUMN public.organizer_payment_accounts.onboarding_state IS
    'Normalized from Stripe account capabilities/requirements by the server; ready == may sell tickets.';

ALTER TABLE public.organizer_payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizer_payment_accounts_select_own ON public.organizer_payment_accounts;
CREATE POLICY organizer_payment_accounts_select_own
    ON public.organizer_payment_accounts
    FOR SELECT
    TO authenticated
    USING (auth.uid () = owner_user_id);

REVOKE ALL ON public.organizer_payment_accounts FROM anon;
GRANT SELECT ON public.organizer_payment_accounts TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Event admission fields on map_beacons (events are beacon_type='event')
-- ---------------------------------------------------------------------------

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS admission_type TEXT NOT NULL DEFAULT 'free'
        CHECK (admission_type IN ('free', 'paid'));

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS organizer_payment_account_id UUID NULL
        REFERENCES public.organizer_payment_accounts (id);

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS ticket_sales_start_at TIMESTAMPTZ NULL;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS ticket_sales_end_at TIMESTAMPTZ NULL;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS refund_policy JSONB NULL;

ALTER TABLE public.map_beacons
    ADD COLUMN IF NOT EXISTS ticketing_status TEXT NOT NULL DEFAULT 'disabled'
        CHECK (
            ticketing_status IN (
                'disabled',
                'draft',
                'ready',
                'sales_open',
                'sales_paused',
                'sales_closed'
            )
        );

COMMENT ON COLUMN public.map_beacons.admission_type IS
    'free keeps the existing RSVP flow; paid requires ticket tiers + a payout-ready organizer account.';

COMMENT ON COLUMN public.map_beacons.ticketing_status IS
    'Sales lifecycle, distinct from admission_type: a paid event can be scheduled, paused, sold out, or blocked by a restricted Stripe account.';

-- ---------------------------------------------------------------------------
-- 3. Ticket tiers (sellable inventory pools)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticket_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    description TEXT NULL,

    currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = lower(currency) AND length(currency) = 3),
    unit_amount INTEGER NOT NULL CHECK (unit_amount >= 0),

    capacity INTEGER NOT NULL CHECK (capacity >= 0),
    max_per_order INTEGER NOT NULL DEFAULT 8 CHECK (max_per_order > 0),
    max_per_user INTEGER NULL CHECK (max_per_user IS NULL OR max_per_user > 0),

    sales_start_at TIMESTAMPTZ NULL,
    sales_end_at TIMESTAMPTZ NULL,

    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_tiers_beacon
    ON public.ticket_tiers (beacon_id, sort_order);

COMMENT ON TABLE public.ticket_tiers IS
    'Sellable inventory pool per event. Capacity is never maintained as a mutable counter: the authoritative sale path locks the tier row and counts sold tickets + active holds atomically (ticketing_reserve_order).';

ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_tiers_select_authenticated ON public.ticket_tiers;
CREATE POLICY ticket_tiers_select_authenticated
    ON public.ticket_tiers
    FOR SELECT
    TO authenticated
    USING (true);

REVOKE ALL ON public.ticket_tiers FROM anon;
GRANT SELECT ON public.ticket_tiers TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Orders (durable reconciliation object between Click and Stripe)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticket_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    -- RESTRICT: an event with financial history cannot be hard-deleted;
    -- cancel/refund it first.
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE RESTRICT,
    buyer_user_id UUID NOT NULL REFERENCES auth.users (id),
    organizer_payment_account_id UUID NOT NULL
        REFERENCES public.organizer_payment_accounts (id),

    currency TEXT NOT NULL CHECK (currency = lower(currency) AND length(currency) = 3),

    subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
    platform_fee_amount INTEGER NOT NULL CHECK (platform_fee_amount >= 0),
    tax_amount INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),

    fee_policy_snapshot JSONB NOT NULL,

    order_state TEXT NOT NULL CHECK (
        order_state IN (
            'reserved',
            'checkout_created',
            'payment_processing',
            'paid',
            'partially_refunded',
            'refunded',
            'expired',
            'canceled',
            'payment_failed',
            'disputed'
        )
    ),

    fulfillment_state TEXT NOT NULL DEFAULT 'unfulfilled' CHECK (
        fulfillment_state IN ('unfulfilled', 'fulfilled', 'voided')
    ),

    stripe_checkout_session_id TEXT NULL UNIQUE,
    stripe_payment_intent_id TEXT NULL UNIQUE,
    stripe_charge_id TEXT NULL,
    stripe_transfer_id TEXT NULL,
    stripe_customer_id TEXT NULL,

    checkout_expires_at TIMESTAMPTZ NULL,
    paid_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_orders_buyer
    ON public.ticket_orders (buyer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_orders_beacon
    ON public.ticket_orders (beacon_id, order_state);

CREATE INDEX IF NOT EXISTS idx_ticket_orders_expiring
    ON public.ticket_orders (checkout_expires_at)
    WHERE order_state IN ('reserved', 'checkout_created');

COMMENT ON TABLE public.ticket_orders IS
    'Durable reconciliation record; exists before the Stripe Checkout Session. order_state (payment) and fulfillment_state (ticket issuance) are deliberately separate facts.';

COMMENT ON COLUMN public.ticket_orders.fee_policy_snapshot IS
    'Immutable snapshot of the platform fee policy used to price this order (auditability if pricing changes).';

ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_orders_select_own ON public.ticket_orders;
CREATE POLICY ticket_orders_select_own
    ON public.ticket_orders
    FOR SELECT
    TO authenticated
    USING (auth.uid () = buyer_user_id);

REVOKE ALL ON public.ticket_orders FROM anon;
GRANT SELECT ON public.ticket_orders TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Order items and inventory holds
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticket_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    order_id UUID NOT NULL REFERENCES public.ticket_orders (id) ON DELETE CASCADE,
    ticket_tier_id UUID NOT NULL REFERENCES public.ticket_tiers (id),

    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_amount INTEGER NOT NULL CHECK (unit_amount >= 0),
    subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),

    tier_name_snapshot TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (order_id, ticket_tier_id)
);

CREATE TABLE IF NOT EXISTS public.ticket_inventory_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    order_id UUID NOT NULL REFERENCES public.ticket_orders (id) ON DELETE CASCADE,
    ticket_tier_id UUID NOT NULL REFERENCES public.ticket_tiers (id),

    quantity INTEGER NOT NULL CHECK (quantity > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    released_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_inventory_holds_tier_active
    ON public.ticket_inventory_holds (ticket_tier_id)
    WHERE consumed_at IS NULL AND released_at IS NULL;

COMMENT ON TABLE public.ticket_inventory_holds IS
    'Reservation rows created inside the same transaction as the order; slightly outlive the 30-minute Stripe Checkout Session to cover webhook delivery, then are released by the expired-session webhook or the cleanup sweep.';

ALTER TABLE public.ticket_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_order_items_select_own ON public.ticket_order_items;
CREATE POLICY ticket_order_items_select_own
    ON public.ticket_order_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.ticket_orders o
            WHERE o.id = order_id
              AND o.buyer_user_id = auth.uid ()
        )
    );

REVOKE ALL ON public.ticket_order_items FROM anon;
GRANT SELECT ON public.ticket_order_items TO authenticated;

ALTER TABLE public.ticket_inventory_holds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ticket_inventory_holds FROM anon;
REVOKE ALL ON public.ticket_inventory_holds FROM authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tickets and check-ins
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES public.ticket_orders (id),
    ticket_tier_id UUID NOT NULL REFERENCES public.ticket_tiers (id),
    owner_user_id UUID NOT NULL REFERENCES auth.users (id),

    -- Guards duplicate minting across webhook retries.
    ordinal INTEGER NOT NULL CHECK (ordinal > 0),
    ticket_number TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'valid' CHECK (
        status IN ('valid', 'checked_in', 'refunded', 'void')
    ),

    -- Hex SHA-256 of the opaque high-entropy QR token. The token itself is
    -- never stored; a leaked database cannot mint admission credentials.
    qr_token_hash TEXT NOT NULL UNIQUE,

    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_in_at TIMESTAMPTZ NULL,
    voided_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (order_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_tickets_owner
    ON public.tickets (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_beacon_status
    ON public.tickets (beacon_id, status);

CREATE INDEX IF NOT EXISTS idx_tickets_tier_status
    ON public.tickets (ticket_tier_id, status);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_select_own ON public.tickets;
CREATE POLICY tickets_select_own
    ON public.tickets
    FOR SELECT
    TO authenticated
    USING (auth.uid () = owner_user_id);

REVOKE ALL ON public.tickets FROM anon;
GRANT SELECT ON public.tickets TO authenticated;

CREATE TABLE IF NOT EXISTS public.ticket_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    ticket_id UUID NOT NULL REFERENCES public.tickets (id),
    beacon_id UUID NOT NULL REFERENCES public.map_beacons (id) ON DELETE CASCADE,

    scanned_by_user_id UUID NOT NULL REFERENCES auth.users (id),
    result TEXT NOT NULL CHECK (
        result IN (
            'accepted',
            'already_checked_in',
            'invalid',
            'void',
            'wrong_event'
        )
    ),

    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_metadata JSONB NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_checkins_ticket
    ON public.ticket_checkins (ticket_id, scanned_at DESC);

COMMENT ON TABLE public.ticket_checkins IS
    'Append-only scan log (including rejected scans). Historical rows are never deleted, even after refunds.';

ALTER TABLE public.ticket_checkins ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ticket_checkins FROM anon;
REVOKE ALL ON public.ticket_checkins FROM authenticated;

-- ---------------------------------------------------------------------------
-- 7. Refunds
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ticket_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    order_id UUID NOT NULL REFERENCES public.ticket_orders (id),

    amount INTEGER NOT NULL CHECK (amount > 0),
    reason TEXT NULL,

    requested_by_user_id UUID NULL REFERENCES auth.users (id),
    ticket_ids UUID[] NOT NULL DEFAULT '{}',

    stripe_refund_id TEXT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'succeeded', 'failed', 'canceled')
    ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_refunds_order
    ON public.ticket_refunds (order_id, created_at DESC);

ALTER TABLE public.ticket_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_refunds_select_own ON public.ticket_refunds;
CREATE POLICY ticket_refunds_select_own
    ON public.ticket_refunds
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.ticket_orders o
            WHERE o.id = order_id
              AND o.buyer_user_id = auth.uid ()
        )
    );

REVOKE ALL ON public.ticket_refunds FROM anon;
GRANT SELECT ON public.ticket_refunds TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Webhook ledger columns on the existing idempotency table
-- ---------------------------------------------------------------------------

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS stripe_event_type TEXT NULL;

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS stripe_object_id TEXT NULL;

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS livemode BOOLEAN NULL;

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS payload JSONB NULL;

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS processing_state TEXT NOT NULL DEFAULT 'received'
        CHECK (
            processing_state IN (
                'received',
                'processing',
                'processed',
                'ignored',
                'failed'
            )
        );

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS last_error TEXT NULL;

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ NULL;

COMMENT ON TABLE public.stripe_webhook_events IS
    'Stripe webhook ledger. id = Stripe event id (first idempotency boundary). Ticketing events also track processing_state so a failed handler can be retried by Stripe redelivery; business mutations carry their own second idempotency boundary (order state + unique Stripe ids).';

-- ---------------------------------------------------------------------------
-- 9. Reservation: transactional inventory allocation
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
    v_beacon RECORD;
    v_account RECORD;
    v_item RECORD;
    v_tier RECORD;
    v_sold INTEGER;
    v_held INTEGER;
    v_owned INTEGER;
    v_computed_subtotal INTEGER := 0;
    v_order_id UUID;
    v_expires TIMESTAMPTZ := now() + make_interval(mins => GREATEST(p_hold_minutes, 1));
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_items');
    END IF;

    SELECT id, creator_id, beacon_type, admission_type, ticketing_status,
           organizer_payment_account_id, ticket_sales_start_at, ticket_sales_end_at
    INTO v_beacon
    FROM map_beacons
    WHERE id = p_beacon;

    IF NOT FOUND OR v_beacon.beacon_type <> 'event' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'event_not_found');
    END IF;
    IF v_beacon.admission_type <> 'paid' OR v_beacon.ticketing_status <> 'sales_open' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'sales_not_open');
    END IF;
    IF v_beacon.ticket_sales_start_at IS NOT NULL AND now() < v_beacon.ticket_sales_start_at THEN
        RETURN jsonb_build_object('ok', false, 'code', 'sales_not_started');
    END IF;
    IF v_beacon.ticket_sales_end_at IS NOT NULL AND now() > v_beacon.ticket_sales_end_at THEN
        RETURN jsonb_build_object('ok', false, 'code', 'sales_ended');
    END IF;
    IF v_beacon.organizer_payment_account_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'code', 'organizer_not_ready');
    END IF;

    SELECT id, onboarding_state, transfers_enabled, charges_enabled
    INTO v_account
    FROM organizer_payment_accounts
    WHERE id = v_beacon.organizer_payment_account_id;

    IF NOT FOUND OR v_account.onboarding_state <> 'ready' OR NOT v_account.transfers_enabled THEN
        RETURN jsonb_build_object('ok', false, 'code', 'organizer_not_ready');
    END IF;

    -- Lock every requested tier row in a stable order so concurrent
    -- reservations serialize instead of deadlocking.
    FOR v_tier IN
        SELECT t.*
        FROM ticket_tiers t
        WHERE t.id IN (
            SELECT (i->>'tier_id')::uuid FROM jsonb_array_elements(p_items) i
        )
        ORDER BY t.id
        FOR UPDATE
    LOOP
        NULL; -- rows are now locked; validated per-item below
    END LOOP;

    FOR v_item IN
        SELECT
            (i->>'tier_id')::uuid AS tier_id,
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
        IF NOT v_tier.is_active THEN
            RETURN jsonb_build_object('ok', false, 'code', 'tier_inactive');
        END IF;
        IF v_tier.currency <> lower(p_currency) THEN
            RETURN jsonb_build_object('ok', false, 'code', 'currency_mismatch');
        END IF;
        -- Price drift guard: the server computed pricing from a snapshot; if
        -- the tier price changed concurrently the reservation must fail.
        IF v_tier.unit_amount <> v_item.expected_unit_amount THEN
            RETURN jsonb_build_object('ok', false, 'code', 'price_changed');
        END IF;
        IF v_tier.sales_start_at IS NOT NULL AND now() < v_tier.sales_start_at THEN
            RETURN jsonb_build_object('ok', false, 'code', 'sales_not_started');
        END IF;
        IF v_tier.sales_end_at IS NOT NULL AND now() > v_tier.sales_end_at THEN
            RETURN jsonb_build_object('ok', false, 'code', 'sales_ended');
        END IF;
        IF v_item.quantity > v_tier.max_per_order THEN
            RETURN jsonb_build_object('ok', false, 'code', 'over_order_limit');
        END IF;

        SELECT count(*) INTO v_sold
        FROM tickets tk
        WHERE tk.ticket_tier_id = v_tier.id
          AND tk.status IN ('valid', 'checked_in');

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
                RETURN jsonb_build_object('ok', false, 'code', 'over_user_limit');
            END IF;
        END IF;

        v_computed_subtotal := v_computed_subtotal + v_tier.unit_amount * v_item.quantity;
    END LOOP;

    IF v_computed_subtotal <> p_subtotal OR p_total <> p_subtotal OR p_platform_fee > p_subtotal THEN
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
    SELECT v_order_id,
           (i->>'tier_id')::uuid,
           (i->>'quantity')::int,
           t.unit_amount,
           t.unit_amount * (i->>'quantity')::int,
           t.name
    FROM jsonb_array_elements(p_items) i
    JOIN ticket_tiers t ON t.id = (i->>'tier_id')::uuid;

    INSERT INTO ticket_inventory_holds (order_id, ticket_tier_id, quantity, expires_at)
    SELECT v_order_id,
           (i->>'tier_id')::uuid,
           (i->>'quantity')::int,
           v_expires
    FROM jsonb_array_elements(p_items) i;

    RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'hold_expires_at', v_expires);
END;
$$;

COMMENT ON FUNCTION public.ticketing_reserve_order IS
    'Atomically validates sales state, price, capacity (sold + active holds) and per-user limits under row locks, then creates a reserved order + inventory holds. All validation failures return before any write.';

REVOKE ALL ON FUNCTION public.ticketing_reserve_order (UUID, UUID, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticketing_reserve_order (UUID, UUID, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Cancel / expire reservations
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_cancel_order (
    p_order UUID,
    p_target_state TEXT DEFAULT 'canceled'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
BEGIN
    IF p_target_state NOT IN ('canceled', 'expired', 'payment_failed') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_target_state');
    END IF;

    SELECT * INTO v_order FROM ticket_orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
    END IF;

    -- Idempotent: already terminal in a compatible way.
    IF v_order.order_state IN ('canceled', 'expired', 'payment_failed') THEN
        RETURN jsonb_build_object('ok', true, 'order_state', v_order.order_state, 'idempotent', true);
    END IF;

    IF v_order.order_state NOT IN ('reserved', 'checkout_created') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'order_not_cancelable', 'order_state', v_order.order_state);
    END IF;

    UPDATE ticket_orders
    SET order_state = p_target_state, updated_at = now()
    WHERE id = p_order;

    UPDATE ticket_inventory_holds
    SET released_at = now()
    WHERE order_id = p_order
      AND consumed_at IS NULL
      AND released_at IS NULL;

    RETURN jsonb_build_object('ok', true, 'order_state', p_target_state);
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_cancel_order (UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticketing_cancel_order (UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.ticketing_expire_stale () RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
    v_id UUID;
BEGIN
    FOR v_id IN
        SELECT id FROM ticket_orders
        WHERE order_state IN ('reserved', 'checkout_created')
          AND checkout_expires_at IS NOT NULL
          AND checkout_expires_at < now() - interval '2 minutes'
    LOOP
        PERFORM ticketing_cancel_order(v_id, 'expired');
        v_count := v_count + 1;
    END LOOP;

    -- Reserved orders that never reached Stripe and whose holds lapsed.
    FOR v_id IN
        SELECT DISTINCT o.id
        FROM ticket_orders o
        JOIN ticket_inventory_holds h ON h.order_id = o.id
        WHERE o.order_state = 'reserved'
          AND o.checkout_expires_at IS NULL
          AND h.consumed_at IS NULL
          AND h.released_at IS NULL
          AND h.expires_at < now()
    LOOP
        PERFORM ticketing_cancel_order(v_id, 'expired');
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.ticketing_expire_stale IS
    'Scheduled sweep releasing lapsed reservations. The checkout.session.expired webhook releases holds earlier when delivered.';

REVOKE ALL ON FUNCTION public.ticketing_expire_stale () FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticketing_expire_stale () TO service_role;

-- ---------------------------------------------------------------------------
-- 11. Fulfillment: mark paid, consume holds, mint tickets, grant attendance
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

    -- Immutable financial reconciliation: the Stripe charge must match the
    -- order snapshot exactly.
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
    WHERE order_id = p_order
      AND consumed_at IS NULL
      AND released_at IS NULL;

    -- unique(order_id, ordinal) + ON CONFLICT DO NOTHING makes minting safe
    -- under duplicate webhook delivery.
    INSERT INTO tickets (beacon_id, order_id, ticket_tier_id, owner_user_id, ordinal, ticket_number, qr_token_hash)
    SELECT v_order.beacon_id,
           p_order,
           (t->>'tier_id')::uuid,
           v_order.buyer_user_id,
           (t->>'ordinal')::int,
           t->>'ticket_number',
           t->>'token_hash'
    FROM jsonb_array_elements(p_tickets) t
    ON CONFLICT (order_id, ordinal) DO NOTHING;

    SELECT array_agg(id) INTO v_ticket_ids FROM tickets WHERE order_id = p_order;

    UPDATE ticket_orders
    SET fulfillment_state = 'fulfilled', updated_at = now()
    WHERE id = p_order;

    -- Ticket-backed attendance: a paid ticket implies the buyer is going.
    INSERT INTO beacon_attendees (beacon_id, user_id, source)
    VALUES (v_order.beacon_id, v_order.buyer_user_id, 'ticket')
    ON CONFLICT (beacon_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'ticket_ids', to_jsonb(v_ticket_ids));
END;
$$;

COMMENT ON FUNCTION public.ticketing_fulfill_order IS
    'Single-transaction fulfillment for a verified successful Stripe payment: mark paid, consume holds, mint tickets idempotently, establish ticket-backed beacon_attendees membership.';

REVOKE ALL ON FUNCTION public.ticketing_fulfill_order (UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticketing_fulfill_order (UUID, TEXT, TEXT, INTEGER, TEXT, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 12. Atomic check-in by opaque credential hash
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
BEGIN
    SELECT * INTO v_ticket
    FROM tickets
    WHERE qr_token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'result', 'invalid');
    END IF;

    IF v_ticket.beacon_id <> p_beacon THEN
        v_result := 'wrong_event';
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

    SELECT u.name, u.image INTO v_attendee
    FROM users u
    WHERE u.id = v_ticket.owner_user_id;

    SELECT t.name INTO v_tier_name FROM ticket_tiers t WHERE t.id = v_ticket.ticket_tier_id;

    RETURN jsonb_build_object(
        'ok', true,
        'result', v_result,
        'ticket_id', v_ticket.id,
        'ticket_number', v_ticket.ticket_number,
        'tier_name', v_tier_name,
        'attendee_name', v_attendee.name,
        'attendee_image', v_attendee.image,
        'checked_in_at', COALESCE(v_ticket.checked_in_at, now())
    );
END;
$$;

COMMENT ON FUNCTION public.ticketing_check_in IS
    'Row-locked scan: exactly one concurrent scan transitions valid -> checked_in; every scan (including rejects) is appended to ticket_checkins.';

REVOKE ALL ON FUNCTION public.ticketing_check_in (UUID, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticketing_check_in (UUID, TEXT, UUID, JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 13. Refund reconciliation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_apply_refund (
    p_order UUID,
    p_stripe_refund TEXT,
    p_amount INTEGER,
    p_status TEXT,
    p_ticket_ids UUID[] DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_refund_id UUID;
    v_refund_ticket_ids UUID[];
    v_remaining INTEGER;
BEGIN
    IF p_status NOT IN ('pending', 'succeeded', 'failed', 'canceled') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_status');
    END IF;

    SELECT * INTO v_order FROM ticket_orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
    END IF;

    -- Upsert the refund row by Stripe id: the API records it as pending at
    -- creation time, but a webhook can also arrive first.
    INSERT INTO ticket_refunds (order_id, amount, stripe_refund_id, status, ticket_ids, completed_at)
    VALUES (
        p_order, p_amount, p_stripe_refund, p_status, COALESCE(p_ticket_ids, '{}'),
        CASE WHEN p_status IN ('succeeded', 'failed', 'canceled') THEN now() ELSE NULL END
    )
    ON CONFLICT (stripe_refund_id) DO UPDATE
    SET status = EXCLUDED.status,
        ticket_ids = CASE
            WHEN cardinality(ticket_refunds.ticket_ids) > 0 THEN ticket_refunds.ticket_ids
            ELSE EXCLUDED.ticket_ids
        END,
        completed_at = CASE
            WHEN EXCLUDED.status IN ('succeeded', 'failed', 'canceled')
                THEN COALESCE(ticket_refunds.completed_at, now())
            ELSE ticket_refunds.completed_at
        END
    RETURNING id INTO v_refund_id;

    IF p_status = 'succeeded' THEN
        SELECT COALESCE(ticket_ids, '{}') INTO v_refund_ticket_ids
        FROM ticket_refunds WHERE id = v_refund_id;

        -- Void exactly the tickets this refund names; a full-order refund
        -- passes every ticket id.
        UPDATE tickets
        SET status = 'refunded', voided_at = COALESCE(voided_at, now())
        WHERE order_id = p_order
          AND id = ANY (v_refund_ticket_ids)
          AND status IN ('valid', 'checked_in');

        SELECT count(*) INTO v_remaining
        FROM tickets
        WHERE order_id = p_order
          AND status IN ('valid', 'checked_in');

        UPDATE ticket_orders
        SET order_state = CASE WHEN v_remaining = 0 THEN 'refunded' ELSE 'partially_refunded' END,
            fulfillment_state = CASE WHEN v_remaining = 0 THEN 'voided' ELSE fulfillment_state END,
            updated_at = now()
        WHERE id = p_order;

        -- Remove ticket-backed admission when the buyer holds no live ticket
        -- for the event; never touch an RSVP the user made independently.
        IF NOT EXISTS (
            SELECT 1 FROM tickets
            WHERE beacon_id = v_order.beacon_id
              AND owner_user_id = v_order.buyer_user_id
              AND status IN ('valid', 'checked_in')
        ) THEN
            DELETE FROM beacon_attendees
            WHERE beacon_id = v_order.beacon_id
              AND user_id = v_order.buyer_user_id
              AND source = 'ticket';
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'refund_id', v_refund_id, 'status', p_status);
END;
$$;

COMMENT ON FUNCTION public.ticketing_apply_refund IS
    'Idempotent refund reconciliation keyed on the Stripe refund id: voids the named tickets on success, derives order refund state, and removes ticket-backed attendance only when no live ticket remains.';

REVOKE ALL ON FUNCTION public.ticketing_apply_refund (UUID, TEXT, INTEGER, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticketing_apply_refund (UUID, TEXT, INTEGER, TEXT, UUID[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 14. Disputes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ticketing_mark_disputed (
    p_order UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM ticket_orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
    END IF;
    IF v_order.order_state = 'disputed' THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true);
    END IF;

    UPDATE ticket_orders
    SET order_state = 'disputed', updated_at = now()
    WHERE id = p_order;

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.ticketing_mark_disputed (UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ticketing_mark_disputed (UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 15. beacon_attendees.source backstop (added by 20260718140000 in most
--     environments; ensure it exists before fulfillment writes it)
-- ---------------------------------------------------------------------------

ALTER TABLE public.beacon_attendees
    ADD COLUMN IF NOT EXISTS source TEXT NULL;
