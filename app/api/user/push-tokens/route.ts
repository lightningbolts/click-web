import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { parseBody } from '@/lib/api/parseBody';
import { pushTokensBodySchema } from '@/lib/api/schemas/user';

type PushPlatform = 'ios' | 'android';
type PushTokenType = 'standard' | 'voip';

type PushTokensBody = {
  token?: unknown;
  platform?: unknown;
  token_type?: unknown;
  device_id?: unknown;
};

export type PushTokensSuccessResponse = {
  ok: true;
};

function isPushPlatform(v: unknown): v is PushPlatform {
  return v === 'ios' || v === 'android';
}

function isPushTokenType(v: unknown): v is PushTokenType {
  return v === 'standard' || v === 'voip';
}

/**
 * POST /api/user/push-tokens
 *
 * Registers an FCM / APNs token for the authenticated user.
 * Upserts on `token`. When `device_id` is present, other rows for the same
 * (user, device, token_type) are removed so re-registration replaces.
 */
export async function POST(request: NextRequest) {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError != null || user == null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(request, pushTokensBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as PushTokensBody;

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  if (!isPushPlatform(body.platform)) {
    return NextResponse.json({ error: "platform must be 'ios' or 'android'" }, { status: 400 });
  }

  const tokenType: PushTokenType = isPushTokenType(body.token_type) ? body.token_type : 'standard';
  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : '';

  const admin = createAdminSupabaseClient();
  const updatedAt = Date.now();

  if (deviceId) {
    const { error: pruneError } = await admin
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('device_id', deviceId)
      .eq('token_type', tokenType)
      .neq('token', token);
    if (pruneError) {
      console.error('[push-tokens] device prune:', pruneError.message);
    }
  }

  const { error } = await admin.from('push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: body.platform,
      token_type: tokenType,
      device_id: deviceId || null,
      updated_at: updatedAt,
    },
    { onConflict: 'token' },
  );

  if (error) {
    console.error('[push-tokens] upsert:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload: PushTokensSuccessResponse = { ok: true };
  return NextResponse.json(payload);
}
