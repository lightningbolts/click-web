-- Activity hints for every change the bell shows, not only brand-new rows.
--
-- `record_activity` re-records a grouped item ("Maya and 2 others reacted") with
-- ON CONFLICT DO UPDATE, which fires UPDATE triggers, not INSERT ones, so it never sent a hint.
-- Reading the inbox on one device should also clear the dot on the others. Both reuse
-- `live_own_rows_inserted` (it only reads `user_id` from the statement's new rows).

DROP TRIGGER IF EXISTS trg_live_activity_items_update ON public.activity_items;
CREATE TRIGGER trg_live_activity_items_update AFTER UPDATE ON public.activity_items
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_own_rows_inserted('activity');

DROP TRIGGER IF EXISTS trg_live_activity_seen_insert ON public.activity_seen;
CREATE TRIGGER trg_live_activity_seen_insert AFTER INSERT ON public.activity_seen
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_own_rows_inserted('activity');

DROP TRIGGER IF EXISTS trg_live_activity_seen_update ON public.activity_seen;
CREATE TRIGGER trg_live_activity_seen_update AFTER UPDATE ON public.activity_seen
    REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.live_own_rows_inserted('activity');
