/**
 * POST /api/me/phone/report { phone } — "That's my number": you tried to save a number another
 * account already holds (PUT /api/me/phone returned 409). Records the number's hash and the
 * current holder for manual review; the plaintext number is never stored.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/withAuth';
import { parseBody } from '@/lib/api/parseBody';
import { apiError } from '@/lib/api/errors';
import { myPhoneBodySchema } from '@/lib/api/schemas/connections';
import { createAdminClient } from '@/lib/server/connectionWriteAuth';
import { normalizePhoneE164, sha256HexUtf8 } from '@/lib/connections/priorConnections';

export async function POST(request: NextRequest) {
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
  const phoneHash = sha256HexUtf8(phone);
  const { data: holder, error: holderErr } = await admin
    .from('user_contact_hashes')
    .select('user_id')
    .eq('hash', phoneHash)
    .maybeSingle();
  if (holderErr) return apiError('Failed to send report', 500, 'report_failed');
  if (!holder?.user_id || holder.user_id === auth.user.id) {
    return apiError('No other account has that number', 404, 'phone_not_claimed');
  }

  // One report per reporter per number; repeating it is a no-op.
  const { error } = await admin
    .from('phone_claim_reports')
    .upsert(
      { phone_hash: phoneHash, holder_id: holder.user_id, reporter_id: auth.user.id },
      { onConflict: 'phone_hash,reporter_id', ignoreDuplicates: true },
    );
  if (error) {
    console.error('[me/phone/report]', error.message);
    return apiError('Failed to send report', 500, 'report_failed');
  }
  return NextResponse.json({ reported: true }, { status: 201 });
}
