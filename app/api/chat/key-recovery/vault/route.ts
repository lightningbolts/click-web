import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api/parseBody';
import { createChatGatekeeperAdmin, requireBearerUser } from '@/lib/server/chatGatekeeper';

const encrypted = z.object({
  version: z.literal(1),
  iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
  ciphertext: z.string().min(24).max(5_600_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();
const putSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  encryptedManifest: encrypted,
}).strict();

// No secret key ever crosses these endpoints. Compare-and-swap prevents lost updates.
export async function GET(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const { data, error } = await createChatGatekeeperAdmin()
    .from('chat_key_recovery_vaults')
    .select('version,encrypted_manifest')
    .eq('user_id', auth.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Vault unavailable' }, { status: 503 });
  return NextResponse.json({ vault: data ? { version: data.version, encryptedManifest: data.encrypted_manifest } : null },
    { headers: { 'Cache-Control': 'no-store' } });
}
export async function PUT(req: NextRequest) {
  const auth = await requireBearerUser(req);
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.response;
  const { expectedVersion, encryptedManifest } = parsed.data;
  const admin = createChatGatekeeperAdmin();
  if (expectedVersion === 0) {
    const { error } = await admin.from('chat_key_recovery_vaults')
      .insert({ user_id: auth.user.id, encrypted_manifest: encryptedManifest, version: 1 });
    if (!error) return NextResponse.json({ version: 1 });
    if (error.code === '23505') return NextResponse.json({ error: 'Version conflict' }, { status: 409 });
    return NextResponse.json({ error: 'Vault unavailable' }, { status: 503 });
  }
  const { data, error } = await admin.from('chat_key_recovery_vaults')
    .update({ encrypted_manifest: encryptedManifest, version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq('user_id', auth.user.id).eq('version', expectedVersion)
    .select('version').maybeSingle();
  if (error) return NextResponse.json({ error: 'Vault unavailable' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Version conflict' }, { status: 409 });
  return NextResponse.json({ version: data.version });
}
