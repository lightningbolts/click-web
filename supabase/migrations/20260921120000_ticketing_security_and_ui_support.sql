-- Corrective, additive ticketing safeguards. Do not enable sales until rollout checks pass.
ALTER TABLE public.map_beacons ADD COLUMN financial_principal_id UUID REFERENCES auth.users(id);
UPDATE public.map_beacons SET financial_principal_id=creator_id WHERE admission_type='paid';
ALTER TABLE public.ticket_orders ADD COLUMN attempt_id UUID;
ALTER TABLE public.ticket_orders ADD COLUMN checkout_items JSONB;
ALTER TABLE public.ticket_orders ADD COLUMN checkout_request JSONB;
ALTER TABLE public.ticket_orders ADD COLUMN reconciliation_error TEXT;
ALTER TABLE public.ticket_orders ADD COLUMN refunded_platform_fee_amount INTEGER NOT NULL DEFAULT 0 CHECK(refunded_platform_fee_amount>=0);
ALTER TABLE public.ticket_refunds ADD COLUMN reconciliation_error TEXT;
ALTER TABLE public.ticket_refunds ADD COLUMN last_reconciled_at TIMESTAMPTZ;
CREATE UNIQUE INDEX ticket_orders_attempt ON public.ticket_orders(beacon_id,buyer_user_id,attempt_id);
DROP POLICY IF EXISTS ticket_tiers_select_authenticated ON public.ticket_tiers;
REVOKE ALL ON public.ticket_tiers FROM anon, authenticated;
-- Clients consume narrow API projections, never immutable Stripe request snapshots.
REVOKE ALL ON public.ticket_orders, public.ticket_order_items, public.ticket_inventory_holds, public.tickets, public.ticket_checkins, public.ticket_refunds, public.organizer_payment_accounts FROM anon, authenticated;
ALTER TABLE public.stripe_webhook_events DROP CONSTRAINT IF EXISTS stripe_webhook_events_processing_state_check;
ALTER TABLE public.stripe_webhook_events ADD CONSTRAINT stripe_webhook_events_processing_state_check CHECK(processing_state IN ('received','processing','processed','ignored','failed','retryable_failure','needs_attention'));
DROP FUNCTION public.ticketing_reserve_order(UUID, UUID, JSONB, TEXT, INTEGER, INTEGER, INTEGER, JSONB, INTEGER);
CREATE OR REPLACE FUNCTION public.ticketing_reserve_order (
    p_buyer UUID,
    p_attempt UUID,
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
    v_existing ticket_orders%ROWTYPE;
    v_request JSONB;
    v_expires TIMESTAMPTZ := now() + make_interval(mins => GREATEST(p_hold_minutes, 1));
BEGIN
    -- Serialize attempts for this buyer/event before allocating inventory.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_beacon::text || p_buyer::text, 0));
    SELECT jsonb_agg(jsonb_build_object('tier_id', i->>'tier_id', 'quantity', (i->>'quantity')::int) ORDER BY i->>'tier_id')
    INTO v_request FROM jsonb_array_elements(p_items) i;
    SELECT * INTO v_existing FROM ticket_orders WHERE beacon_id=p_beacon AND buyer_user_id=p_buyer AND attempt_id=p_attempt;
    IF FOUND THEN
        IF v_existing.checkout_items <> v_request THEN
            RETURN jsonb_build_object('ok', false, 'code', 'attempt_conflict');
        END IF;
        RETURN jsonb_build_object('ok', true, 'order_id', v_existing.id);
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_items');
    END IF;

    SELECT id, creator_id, beacon_type, admission_type, ticketing_status,
           organizer_payment_account_id, ticket_sales_start_at, ticket_sales_end_at, financial_principal_id, event_visibility
    INTO v_beacon
    FROM map_beacons
    WHERE id = p_beacon FOR UPDATE;

    IF NOT FOUND OR v_beacon.beacon_type <> 'event' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'event_not_found');
    END IF;
    IF v_beacon.event_visibility = 'invite_only' AND p_buyer <> v_beacon.creator_id AND NOT EXISTS (
        SELECT 1 FROM event_guest_lists l JOIN event_guest_list_entries e ON e.guest_list_id=l.id
        WHERE l.beacon_id=p_beacon AND e.matched_user_id=p_buyer
    ) THEN RETURN jsonb_build_object('ok', false, 'code', 'invitation_required'); END IF;
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

    SELECT id, owner_user_id, onboarding_state, transfers_enabled, charges_enabled, payouts_enabled
    INTO v_account
    FROM organizer_payment_accounts
    WHERE id = v_beacon.organizer_payment_account_id;

    IF NOT FOUND OR v_account.onboarding_state <> 'ready' OR NOT v_account.transfers_enabled OR NOT v_account.charges_enabled OR NOT v_account.payouts_enabled OR v_account.owner_user_id IS DISTINCT FROM v_beacon.financial_principal_id THEN
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
          AND h.released_at IS NULL;

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
            SELECT v_owned + COALESCE(sum(h.quantity),0) INTO v_owned
            FROM ticket_inventory_holds h JOIN ticket_orders o ON o.id=h.order_id
            WHERE h.ticket_tier_id=v_tier.id AND o.buyer_user_id=p_buyer AND h.consumed_at IS NULL AND h.released_at IS NULL;
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
        fee_policy_snapshot, order_state, attempt_id, checkout_items, checkout_expires_at
    ) VALUES (
        p_beacon, p_buyer, v_account.id,
        lower(p_currency), p_subtotal, p_platform_fee, p_total,
        p_fee_policy, 'reserved', p_attempt, v_request, now() + interval '35 minutes'
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
-- Clock expiry is a reconciliation hint, never evidence that payment cannot settle.
CREATE OR REPLACE FUNCTION public.ticketing_expire_stale() RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT 0; $$;
DROP FUNCTION public.ticketing_fulfill_order(UUID,TEXT,TEXT,INTEGER,TEXT,JSONB);
CREATE OR REPLACE FUNCTION public.ticketing_fulfill_order (
    p_order UUID,
    p_session TEXT,
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
    PERFORM 1 FROM map_beacons WHERE id=(SELECT beacon_id FROM ticket_orders WHERE id=p_order) FOR UPDATE;
    SELECT * INTO v_order FROM ticket_orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
    END IF;

    IF v_order.stripe_checkout_session_id IS NOT NULL AND v_order.stripe_checkout_session_id <> p_session THEN
        RETURN jsonb_build_object('ok',false,'code','session_mismatch');
    END IF;
    IF p_amount <> v_order.total_amount OR lower(p_currency) <> v_order.currency THEN
        RETURN jsonb_build_object('ok',false,'code','amount_mismatch');
    END IF;
    IF v_order.paid_at IS NOT NULL AND v_order.stripe_payment_intent_id=p_payment_intent THEN
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

    IF EXISTS (
      SELECT i.ticket_tier_id FROM ticket_order_items i WHERE i.order_id=p_order AND i.quantity <>
      (SELECT count(*) FROM jsonb_array_elements(p_tickets) t WHERE (t->>'tier_id')::uuid=i.ticket_tier_id)
    ) OR jsonb_array_length(p_tickets) <> (SELECT sum(quantity) FROM ticket_order_items WHERE order_id=p_order)
    OR (SELECT count(DISTINCT t->>'ordinal') FROM jsonb_array_elements(p_tickets) t) <> jsonb_array_length(p_tickets) THEN
      RETURN jsonb_build_object('ok',false,'code','invalid_tickets');
    END IF;
    UPDATE ticket_orders
    SET order_state = 'paid',
        stripe_checkout_session_id = COALESCE(stripe_checkout_session_id,p_session),
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

    PERFORM set_config('click.ticket_admission_write', 'on', true);
    -- Ticket-backed attendance: a paid ticket implies the buyer is going.
    INSERT INTO beacon_attendees (beacon_id, user_id, source)
    VALUES (v_order.beacon_id, v_order.buyer_user_id, 'ticket')
    ON CONFLICT (beacon_id, user_id) DO NOTHING;

    RETURN jsonb_build_object('ok', true, 'ticket_ids', to_jsonb(v_ticket_ids));
END;
$$;
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
    IF NOT EXISTS (SELECT 1 FROM map_beacons b WHERE b.id=p_beacon AND (b.creator_id=p_scanner OR EXISTS (SELECT 1 FROM venue_managers m WHERE m.venue_id=b.venue_id AND m.user_id=p_scanner))) THEN
        RETURN jsonb_build_object('ok',false,'code','forbidden');
    END IF;
    SELECT * INTO v_ticket
    FROM tickets
    WHERE qr_token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'result', 'invalid');
    END IF;

    IF v_ticket.beacon_id <> p_beacon THEN
        RETURN jsonb_build_object('ok',true,'result','wrong_event');
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
DROP FUNCTION public.ticketing_apply_refund(UUID,TEXT,INTEGER,TEXT,UUID[]);
CREATE OR REPLACE FUNCTION public.ticketing_apply_refund (
    p_order UUID,
    p_request UUID,
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
    v_claim ticket_refunds%ROWTYPE;
BEGIN
    IF p_status NOT IN ('pending', 'succeeded', 'failed', 'canceled') THEN
        RETURN jsonb_build_object('ok', false, 'code', 'invalid_status');
    END IF;

    SELECT * INTO v_order FROM ticket_orders WHERE id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'code', 'order_not_found');
    END IF;

    SELECT * INTO v_claim FROM ticket_refunds WHERE id=p_request AND order_id=p_order AND ticket_ids @> p_ticket_ids AND ticket_ids <@ p_ticket_ids FOR UPDATE;
    IF NOT FOUND OR v_claim.amount <> p_amount OR (v_claim.stripe_refund_id IS NOT NULL AND v_claim.stripe_refund_id <> p_stripe_refund) THEN
        RETURN jsonb_build_object('ok',false,'code','refund_mismatch');
    END IF;
    IF v_claim.status='succeeded' THEN RETURN jsonb_build_object('ok',true,'refund_id',v_claim.id,'status','succeeded'); END IF;
    v_refund_id := v_claim.id;
    UPDATE ticket_refunds SET stripe_refund_id=p_stripe_refund,status=p_status,
      completed_at=CASE WHEN p_status IN ('succeeded','failed','canceled') THEN now() ELSE NULL END WHERE id=v_refund_id;

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
            PERFORM set_config('click.ticket_admission_write', 'on', true);
            DELETE FROM beacon_attendees
            WHERE beacon_id = v_order.beacon_id
              AND user_id = v_order.buyer_user_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'refund_id', v_refund_id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_guard_admission() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_event UUID;
BEGIN
  v_event := CASE WHEN TG_OP='DELETE' THEN OLD.beacon_id ELSE NEW.beacon_id END;
  IF (EXISTS(SELECT 1 FROM map_beacons WHERE id=v_event AND admission_type='paid') OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM map_beacons WHERE id=OLD.beacon_id AND admission_type='paid'))) AND
    (current_setting('click.ticket_admission_write',true) IS DISTINCT FROM 'on' OR current_user <> 'postgres') THEN
    RAISE EXCEPTION 'ticket_required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ticketing_admission_guard BEFORE INSERT OR UPDATE OR DELETE ON public.beacon_attendees FOR EACH ROW EXECUTE FUNCTION public.ticketing_guard_admission();

CREATE OR REPLACE FUNCTION public.ticketing_claim_refund(p_request UUID,p_order UUID,p_actor UUID,p_tickets UUID[],p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o ticket_orders%ROWTYPE; r ticket_refunds%ROWTYPE; ids UUID[]; amount INTEGER;
BEGIN
 SELECT * INTO o FROM ticket_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','order_not_found'); END IF;
 IF NOT EXISTS(SELECT 1 FROM map_beacons WHERE id=o.beacon_id AND financial_principal_id=p_actor) THEN RETURN jsonb_build_object('ok',false,'code','forbidden'); END IF;
 SELECT * INTO r FROM ticket_refunds WHERE id=p_request;
 IF FOUND THEN
   IF r.order_id<>p_order OR r.requested_by_user_id<>p_actor OR r.reason IS DISTINCT FROM p_reason OR (p_tickets IS NOT NULL AND NOT(r.ticket_ids @> p_tickets AND r.ticket_ids <@ p_tickets)) THEN
     RETURN jsonb_build_object('ok',false,'code','refund_request_conflict');
   END IF;
   RETURN jsonb_build_object('ok',true,'refund',to_jsonb(r));
 END IF;
 IF o.order_state NOT IN ('paid','partially_refunded') THEN RETURN jsonb_build_object('ok',false,'code','order_not_refundable'); END IF;
 SELECT array_agg(t.id ORDER BY t.id),sum(i.unit_amount) INTO ids,amount FROM tickets t JOIN ticket_order_items i ON i.order_id=t.order_id AND i.ticket_tier_id=t.ticket_tier_id
 WHERE t.order_id=p_order AND t.status IN ('valid','checked_in') AND (p_tickets IS NULL OR t.id=ANY(p_tickets));
 IF amount IS NULL OR amount<=0 OR (p_tickets IS NOT NULL AND cardinality(ids)<>cardinality(p_tickets)) THEN RETURN jsonb_build_object('ok',false,'code','ticket_not_refundable'); END IF;
 IF EXISTS(SELECT 1 FROM ticket_refunds WHERE order_id=p_order AND status IN ('pending','succeeded') AND ticket_ids && ids) THEN RETURN jsonb_build_object('ok',false,'code','refund_in_progress'); END IF;
 INSERT INTO ticket_refunds(id,order_id,amount,reason,requested_by_user_id,ticket_ids) VALUES(p_request,p_order,amount,p_reason,p_actor,ids) RETURNING * INTO r;
 RETURN jsonb_build_object('ok',true,'refund',to_jsonb(r));
END; $$;


CREATE OR REPLACE FUNCTION public.ticketing_tier_inventory(p_beacons UUID[]) RETURNS TABLE(id UUID,beacon_id UUID,name TEXT,description TEXT,currency TEXT,unit_amount INTEGER,capacity INTEGER,max_per_order INTEGER,max_per_user INTEGER,sales_start_at TIMESTAMPTZ,sales_end_at TIMESTAMPTZ,sort_order INTEGER,is_active BOOLEAN,sold BIGINT,held BIGINT,remaining BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT t.id,t.beacon_id,t.name,t.description,t.currency,t.unit_amount,t.capacity,t.max_per_order,t.max_per_user,t.sales_start_at,t.sales_end_at,t.sort_order,t.is_active,
 s.n,h.n,GREATEST(t.capacity-s.n-h.n,0)
 FROM ticket_tiers t
 CROSS JOIN LATERAL (SELECT count(*) n FROM tickets k WHERE k.ticket_tier_id=t.id AND k.status IN ('valid','checked_in')) s
 CROSS JOIN LATERAL (SELECT COALESCE(sum(quantity),0) n FROM ticket_inventory_holds h WHERE h.ticket_tier_id=t.id AND h.consumed_at IS NULL AND h.released_at IS NULL) h
 WHERE t.beacon_id=ANY(p_beacons) ORDER BY t.sort_order,t.id;
$$;

CREATE OR REPLACE FUNCTION public.ticketing_patch_tier(p_beacon UUID,p_tier UUID,p_patch JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t ticket_tiers%ROWTYPE; v_sold BIGINT; v_held BIGINT;
BEGIN
 -- Same lock order as reservation and publication.
 PERFORM 1 FROM map_beacons WHERE id=p_beacon FOR UPDATE;
 SELECT * INTO t FROM ticket_tiers WHERE id=p_tier AND beacon_id=p_beacon FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','tier_not_found'); END IF;
 SELECT * INTO t FROM jsonb_populate_record(t,p_patch);
 SELECT count(*) INTO v_sold FROM tickets WHERE ticket_tier_id=t.id AND status IN ('valid','checked_in');
 SELECT COALESCE(sum(quantity),0) INTO v_held FROM ticket_inventory_holds WHERE ticket_tier_id=t.id AND consumed_at IS NULL AND released_at IS NULL;
 IF t.capacity<v_sold+v_held THEN RETURN jsonb_build_object('ok',false,'code','capacity_below_committed'); END IF;
 IF t.sales_start_at IS NOT NULL AND t.sales_end_at IS NOT NULL AND t.sales_start_at>=t.sales_end_at THEN RETURN jsonb_build_object('ok',false,'code','invalid_sales_window'); END IF;
 UPDATE ticket_tiers SET name=t.name,description=t.description,unit_amount=t.unit_amount,capacity=t.capacity,max_per_order=t.max_per_order,max_per_user=t.max_per_user,sales_start_at=t.sales_start_at,sales_end_at=t.sales_end_at,sort_order=t.sort_order,is_active=t.is_active,updated_at=now() WHERE id=t.id;
 RETURN jsonb_build_object('ok',true);
END; $$;

CREATE OR REPLACE FUNCTION public.ticketing_set_status(p_beacon UUID,p_actor UUID,p_patch JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b map_beacons%ROWTYPE; a organizer_payment_accounts%ROWTYPE; target TEXT; starts TIMESTAMPTZ; ends TIMESTAMPTZ;
BEGIN
 SELECT * INTO b FROM map_beacons WHERE id=p_beacon FOR UPDATE;
 IF NOT FOUND OR b.beacon_type<>'event' THEN RETURN jsonb_build_object('ok',false,'code','event_not_found'); END IF;
 IF p_actor IS DISTINCT FROM COALESCE(b.financial_principal_id,b.creator_id) THEN RETURN jsonb_build_object('ok',false,'code','financial_organizer_required'); END IF;
 IF b.admission_type='free' AND (EXISTS(SELECT 1 FROM beacon_attendees WHERE beacon_id=p_beacon) OR EXISTS(SELECT 1 FROM event_guest_rsvps WHERE beacon_id=p_beacon)) THEN RETURN jsonb_build_object('ok',false,'code','existing_free_attendees'); END IF;
 target:=p_patch->>'ticketing_status';
 IF NOT ((b.ticketing_status IN ('disabled','draft','ready') AND target IN ('draft','sales_open')) OR (b.ticketing_status='sales_open' AND target IN ('sales_paused','sales_closed')) OR (b.ticketing_status='sales_paused' AND target IN ('sales_open','sales_closed')) OR b.ticketing_status=target) THEN RETURN jsonb_build_object('ok',false,'code','invalid_transition'); END IF;
 starts:=CASE WHEN p_patch ? 'ticket_sales_start_at' THEN (p_patch->>'ticket_sales_start_at')::timestamptz ELSE b.ticket_sales_start_at END;
 ends:=CASE WHEN p_patch ? 'ticket_sales_end_at' THEN (p_patch->>'ticket_sales_end_at')::timestamptz ELSE b.ticket_sales_end_at END;
 IF starts IS NOT NULL AND ends IS NOT NULL AND starts>=ends THEN RETURN jsonb_build_object('ok',false,'code','invalid_sales_window'); END IF;
 IF target='sales_open' THEN
  SELECT * INTO a FROM organizer_payment_accounts WHERE owner_user_id=COALESCE(b.financial_principal_id,b.creator_id);
  IF NOT FOUND OR a.onboarding_state<>'ready' OR NOT a.charges_enabled OR NOT a.payouts_enabled OR NOT a.transfers_enabled THEN RETURN jsonb_build_object('ok',false,'code','organizer_not_ready'); END IF;
  IF NOT EXISTS(SELECT 1 FROM ticket_tiers WHERE beacon_id=p_beacon AND is_active AND length(trim(name))>0 AND capacity>0 AND unit_amount>0 AND (sales_end_at IS NULL OR sales_end_at>now())) THEN RETURN jsonb_build_object('ok',false,'code','no_active_tiers'); END IF;
  IF ends IS NOT NULL AND ends<=now() THEN RETURN jsonb_build_object('ok',false,'code','sales_ended'); END IF;
 END IF;
 UPDATE map_beacons SET admission_type='paid',financial_principal_id=COALESCE(b.financial_principal_id,b.creator_id),organizer_payment_account_id=COALESCE(b.organizer_payment_account_id,a.id),ticketing_status=target,ticket_sales_start_at=starts,ticket_sales_end_at=ends WHERE id=p_beacon;
 RETURN jsonb_build_object('ok',true,'ticketing_status',target);
END; $$;

CREATE OR REPLACE FUNCTION public.ticketing_guard_principal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user <> 'postgres' AND (NEW.admission_type IS DISTINCT FROM OLD.admission_type OR NEW.ticketing_status IS DISTINCT FROM OLD.ticketing_status OR NEW.financial_principal_id IS DISTINCT FROM OLD.financial_principal_id OR NEW.organizer_payment_account_id IS DISTINCT FROM OLD.organizer_payment_account_id OR NEW.ticket_sales_start_at IS DISTINCT FROM OLD.ticket_sales_start_at OR NEW.ticket_sales_end_at IS DISTINCT FROM OLD.ticket_sales_end_at) THEN RAISE EXCEPTION 'ticketing_configuration_requires_rpc'; END IF;
 IF OLD.financial_principal_id IS NOT NULL AND (NEW.financial_principal_id IS DISTINCT FROM OLD.financial_principal_id OR NEW.organizer_payment_account_id IS DISTINCT FROM OLD.organizer_payment_account_id AND OLD.organizer_payment_account_id IS NOT NULL OR NEW.admission_type<>'paid') THEN RAISE EXCEPTION 'financial_principal_immutable'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER ticketing_principal_guard BEFORE UPDATE ON public.map_beacons FOR EACH ROW EXECUTE FUNCTION public.ticketing_guard_principal();
-- Guest and approval routes must never establish paid admission either.
CREATE TRIGGER ticketing_guest_admission_guard BEFORE INSERT OR UPDATE OR DELETE ON public.event_guest_rsvps FOR EACH ROW EXECUTE FUNCTION public.ticketing_guard_admission();
CREATE TRIGGER ticketing_request_admission_guard BEFORE INSERT OR UPDATE OR DELETE ON public.event_rsvp_requests FOR EACH ROW EXECUTE FUNCTION public.ticketing_guard_admission();

CREATE OR REPLACE FUNCTION public.ticketing_sales_summary(p_beacon UUID) RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'gross',COALESCE((SELECT sum(total_amount) FROM ticket_orders WHERE beacon_id=p_beacon AND paid_at IS NOT NULL),0),
  'platform_fee',COALESCE((SELECT sum(platform_fee_amount) FROM ticket_orders WHERE beacon_id=p_beacon AND paid_at IS NOT NULL),0),
  'refunded_platform_fee',COALESCE((SELECT sum(refunded_platform_fee_amount) FROM ticket_orders WHERE beacon_id=p_beacon AND paid_at IS NOT NULL),0),
  'refunded',COALESCE((SELECT sum(r.amount) FROM ticket_refunds r JOIN ticket_orders o ON o.id=r.order_id WHERE o.beacon_id=p_beacon AND r.status='succeeded'),0),
  'sold',(SELECT count(*) FROM tickets WHERE beacon_id=p_beacon AND status IN ('valid','checked_in')),
  'checked_in',(SELECT count(*) FROM tickets WHERE beacon_id=p_beacon AND status='checked_in'),
  'refunded_tickets',(SELECT count(*) FROM tickets WHERE beacon_id=p_beacon AND status='refunded'),
  'tiers',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM ticketing_tier_inventory(ARRAY[p_beacon]) t),'[]'::jsonb)
 );
$$;
-- Explicitly revoke Supabase default function grants, including existing RPCs.
CREATE OR REPLACE FUNCTION public.ticketing_record_fee_refunds(p_order UUID,p_charge TEXT,p_amount INTEGER) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE ticket_orders SET refunded_platform_fee_amount=GREATEST(refunded_platform_fee_amount,p_amount)
 WHERE id=p_order AND stripe_charge_id=p_charge AND p_amount BETWEEN 0 AND platform_fee_amount;
$$;

DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'ticketing_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
