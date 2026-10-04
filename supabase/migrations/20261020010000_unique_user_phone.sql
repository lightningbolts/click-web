-- One account per phone number. The contact-hash trigger's ON CONFLICT hands a hash to the last
-- writer, so two overlapping PUT /api/me/phone calls could otherwise both keep the same number;
-- with this index the second fails (23505) and the API answers 409 phone_taken.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_e164_unique
    ON public.users (phone_e164)
    WHERE phone_e164 IS NOT NULL;
