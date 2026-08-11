/**
 * PATCH /api/user/availability
 * Upserts `user_availability` for the authenticated user.
 * Array fields are normalized to native `string[]` (never double-stringified JSON blobs).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { normalizeStringArrayField } from '@/lib/userProfile/availability';
import { parseBody } from '@/lib/api/parseBody';
import { availabilityBodySchema } from '@/lib/api/schemas/user';

type PatchBody = {
  preferred_activities?: unknown;
  available_days?: unknown;
  is_free_this_week?: unknown;
  custom_status?: unknown;
};

export async function PATCH(request: NextRequest) {
  const { user, supabase } = await getAuthenticatedSupabase(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(request, availabilityBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as PatchBody;

  const { data: existing, error: loadErr } = await supabase
    .from('user_availability')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (loadErr) {
    console.error('user_availability load:', loadErr.message);
    return NextResponse.json({ error: loadErr.message }, { status: 400 });
  }

  const preferred_activities =
    body.preferred_activities !== undefined
      ? normalizeStringArrayField(body.preferred_activities)
      : normalizeStringArrayField(existing?.preferred_activities);

  const available_days =
    body.available_days !== undefined
      ? normalizeStringArrayField(body.available_days)
      : normalizeStringArrayField(existing?.available_days);

  const is_free_this_week =
    typeof body.is_free_this_week === 'boolean'
      ? body.is_free_this_week
      : Boolean(existing?.is_free_this_week);

  let custom_status: string | null =
    typeof existing?.custom_status === 'string' ? existing.custom_status : null;
  if (body.custom_status !== undefined) {
    if (body.custom_status === null) {
      custom_status = null;
    } else if (typeof body.custom_status === 'string') {
      const t = body.custom_status.trim();
      custom_status = t.length > 0 ? t : null;
    } else {
      return NextResponse.json({ error: 'custom_status must be a string or null' }, { status: 400 });
    }
  }

  const row = {
    user_id: user.id,
    is_free_this_week,
    available_days,
    preferred_activities,
    custom_status,
    last_updated: Date.now(),
  };

  const { data: saved, error: upsertErr } = await supabase
    .from('user_availability')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .maybeSingle();

  if (upsertErr) {
    console.error('user_availability upsert:', upsertErr.message);
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }

  return NextResponse.json({ availability: saved });
}
