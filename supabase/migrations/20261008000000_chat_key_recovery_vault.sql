-- Ciphertext-only E2EE recovery vault. No decryption material is available to the service.
CREATE TABLE IF NOT EXISTS public.chat_key_recovery_vaults (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  encrypted_manifest jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manifest_is_v1 CHECK (encrypted_manifest->>'version' = '1')
);
CREATE TABLE IF NOT EXISTS public.chat_key_recovery_credentials (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  encrypted_backup_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, credential_id),
  CONSTRAINT backup_key_is_v1 CHECK (encrypted_backup_key->>'version' = '1'),
  CONSTRAINT credential_id_length CHECK (length(credential_id) BETWEEN 16 AND 1024)
);
ALTER TABLE public.chat_key_recovery_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_key_recovery_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_key_recovery_vaults FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.chat_key_recovery_credentials FROM PUBLIC, anon, authenticated;
-- Only the server route using the service role can read/write ciphertext.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_key_recovery_vaults TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_key_recovery_credentials TO service_role;
