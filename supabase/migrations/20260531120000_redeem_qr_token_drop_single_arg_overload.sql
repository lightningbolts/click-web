-- PostgREST PGRST203: cannot resolve overload when only p_token is sent if both exist:
--   redeem_qr_token(text)
--   redeem_qr_token(text, double precision, double precision)
-- Keep the proximity-aware function (scanner lat/lon default to NULL).

DROP FUNCTION IF EXISTS public.redeem_qr_token(text);
