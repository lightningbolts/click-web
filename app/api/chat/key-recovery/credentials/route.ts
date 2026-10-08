import { NextRequest, NextResponse } from 'next/server';
import { HISTORY_RECOVERY_ENABLED } from '@/lib/chat/recoveryFeature';
import { z } from 'zod';
import { parseBody } from '@/lib/api/parseBody';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

const envelope = z.object({
  version: z.literal(1),
  iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
  ciphertext: z.string().min(24).max(256).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();
const schema = z.object({
  credentialId: z.string().min(16).max(1024).regex(/^[A-Za-z0-9_-]+$/),
  encryptedBackupKey: envelope,
}).strict();

// These are opaque WebAuthn PRF-wrapped backup keys. The server cannot decrypt them.
export async function GET(req: NextRequest) {
  if (!HISTORY_RECOVERY_ENABLED) return NextResponse.json({ error: 'Recovery not enabled' }, { status: 404 });
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { data, error } = await createChatGatekeeperAdmin()
    .from('chat_key_recovery_credentials')
    .select('credential_id,encrypted_backup_key,created_at')
    .eq('user_id', auth.user.id).order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: 'Credential recovery unavailable' }, { status: 503 });
  return NextResponse.json({ credentials: (data ?? []).map((row) => ({
    credentialId: row.credential_id, encryptedBackupKey: row.encrypted_backup_key,
    createdAt: row.created_at,
  })) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!HISTORY_RECOVERY_ENABLED) return NextResponse.json({ error: 'Recovery not enabled' }, { status: 404 });
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { error } = await createChatGatekeeperAdmin().from('chat_key_recovery_credentials')
    .insert({
      user_id: auth.user.id,
      credential_id: parsed.data.credentialId,
      encrypted_backup_key: parsed.data.encryptedBackupKey,
    });
  if (error?.code === '23505') return NextResponse.json({ error: 'Credential already enrolled' }, { status: 409 });
  if (error) return NextResponse.json({ error: 'Credential enrollment unavailable' }, { status: 503 });
  return NextResponse.json({ enrolled: true }, { status: 201 });
}
