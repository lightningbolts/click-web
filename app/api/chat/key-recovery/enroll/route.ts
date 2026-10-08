import { NextRequest, NextResponse } from 'next/server';
import { HISTORY_RECOVERY_ENABLED } from '@/lib/chat/recoveryFeature';
import { z } from 'zod';
import { parseBody } from '@/lib/api/parseBody';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

const encrypted = z.object({
  version: z.literal(1),
  iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
  ciphertext: z.string().min(24).max(5_600_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();
const schema = z.object({
  credentialId: z.string().regex(/^[A-Za-z0-9_-]{16,1024}$/),
  encryptedBackupKey: encrypted,
  encryptedManifest: encrypted,
}).strict();

// Passkey PRF is evaluated only on the client. Enrollment is atomic on the database.
export async function POST(req: NextRequest) {
  if (!HISTORY_RECOVERY_ENABLED) return NextResponse.json({ error: 'Recovery not enabled' }, { status: 404 });
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.encryptedBackupKey.ciphertext.length > 256) {
    return NextResponse.json({ error: 'Invalid encrypted recovery enrollment' }, { status: 400 });
  }
  const { data, error } = await createChatGatekeeperAdmin().rpc('enroll_chat_key_recovery', {
    p_user_id: auth.user.id,
    p_credential_id: parsed.data.credentialId,
    p_encrypted_backup_key: parsed.data.encryptedBackupKey,
    p_encrypted_manifest: parsed.data.encryptedManifest,
  });
  if (error?.code === '23505') return NextResponse.json({ error: 'Recovery already enrolled' }, { status: 409 });
  if (error) return NextResponse.json({ error: 'Recovery enrollment unavailable' }, { status: 503 });
  return NextResponse.json({ version: data }, { status: 201 });
}
