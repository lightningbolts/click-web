/**
 * Your own phone number, used only so friends who have it in their contacts can find you
 * (it's hashed into `user_contact_hashes` by a trigger and never returned to anyone else).
 *
 * GET    /api/me/phone            → { phone: "+12065550100" | null }
 * PUT    /api/me/phone { phone }  → normalizes to E.164 and saves; 409 if another account has it,
 *                                   429 after 3 changes in 24h (numbers aren't SMS-verified, so
 *                                   this keeps anyone from cycling through numbers).
 * DELETE /api/me/phone            → removes it (friends can no longer find you by number).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/withAuth';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { myPhoneBodySchema } from '@/lib/api/schemas/connections';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { normalizePhoneE164, sha256HexUtf8 } from '@/lib/connections/priorConnections';

const PHONE_CHANGES_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { data, error } = await createAdminClient()
    .from('users')
    .select('phone_e164')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (error) return apiError('Failed to load phone', 500, 'phone_failed');
  const phone = typeof data?.phone_e164 === 'string' && data.phone_e164 ? data.phone_e164 : null;
  return NextResponse.json({ phone });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const parsed = await parseBody(request, myPhoneBodySchema);
  if (!parsed.ok) return parsed.response;

  // Only digits, spaces and phone punctuation: "ext 12" / "x12" / ";12" would be folded into
  // the digits and produce a number no contact card ever matches.
  const phone = /^[+\d\s().-]+$/.test(parsed.data.phone) ? normalizePhoneE164(parsed.data.phone) : null;
  if (!phone || phone.length > 16) {
    return apiError('Enter a valid phone number', 400, 'invalid_phone');
  }

  const admin = createAdminClient();
  // The hash row is what discover matches on; one number belongs to one account.
  const { data: owner, error: ownerErr } = await admin
    .from('user_contact_hashes')
    .select('user_id')
    .eq('hash', sha256HexUtf8(phone))
    .maybeSingle();
  if (ownerErr) return apiError('Failed to save phone', 500, 'phone_failed');
  if (owner?.user_id && owner.user_id !== auth.user.id) {
    return apiError('That number is already on another Click account', 409, 'phone_taken');
  }
  // Already yours: nothing changes, so it doesn't count toward the daily limit.
  if (owner?.user_id === auth.user.id) return NextResponse.json({ phone });

  const { count, error: countErr } = await admin
    .from('user_phone_changes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
    .gte('created_at', new Date(Date.now() - DAY_MS).toISOString());
  if (countErr) return apiError('Failed to save phone', 500, 'phone_failed');
  if ((count ?? 0) >= PHONE_CHANGES_PER_DAY) {
    return apiError('You can change your number again tomorrow', 429, 'phone_rate_limited');
  }

  const { error } = await admin.from('users').update({ phone_e164: phone }).eq('id', auth.user.id);
  // 23505: another account saved this number between the check above and now.
  if (error?.code === '23505') {
    return apiError('That number is already on another Click account', 409, 'phone_taken');
  }
  if (error) return apiError('Failed to save phone', 500, 'phone_failed');
  const { error: logErr } = await admin.from('user_phone_changes').insert({ user_id: auth.user.id });
  if (logErr) console.warn('[me/phone] change log:', logErr.message);
  return NextResponse.json({ phone });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;
  const { error } = await createAdminClient()
    .from('users')
    .update({ phone_e164: null })
    .eq('id', auth.user.id);
  if (error) return apiError('Failed to remove phone', 500, 'phone_failed');
  return new NextResponse(null, { status: 204 });
}
