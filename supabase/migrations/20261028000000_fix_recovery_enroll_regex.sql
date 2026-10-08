-- Postgres caps regex repetition counts at 255, so `{16,1024}` made every enrollment raise
-- "invalid regular expression" (the web showed "Recovery enrollment unavailable"). The table's
-- credential_id_length constraint already uses length(); check the alphabet and length separately.
CREATE OR REPLACE FUNCTION public.enroll_chat_key_recovery(
  p_user_id uuid,
  p_credential_id text,
  p_encrypted_backup_key jsonb,
  p_encrypted_manifest jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off
AS $$
BEGIN
  IF p_user_id IS NULL OR p_credential_id !~ '^[A-Za-z0-9_-]+$'
     OR length(p_credential_id) NOT BETWEEN 16 AND 1024
     OR p_encrypted_backup_key->>'version' <> '1'
     OR p_encrypted_manifest->>'version' <> '1' THEN
    RAISE EXCEPTION 'Invalid encrypted recovery enrollment' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.chat_key_recovery_vaults(user_id, encrypted_manifest)
  VALUES (p_user_id, p_encrypted_manifest);
  INSERT INTO public.chat_key_recovery_credentials(user_id, credential_id, encrypted_backup_key)
  VALUES (p_user_id, p_credential_id, p_encrypted_backup_key);
  RETURN 1;
END;
$$;
REVOKE ALL ON FUNCTION public.enroll_chat_key_recovery(uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_chat_key_recovery(uuid, text, jsonb, jsonb) TO service_role;
