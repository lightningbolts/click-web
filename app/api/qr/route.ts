import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import crypto from 'crypto';

/**
 * QR Code Connection API — Proximity Verification Layer 1
 *
 * GET  → Generate a time-bounded, single-use QR token (90s TTL)
 * POST → Redeem a QR token (atomic, race-condition safe)
 *
 * Old format: click://connect/{userId}  (static, vulnerable to screenshots)
 * New format: JSON with { token, userId, exp } (single-use, expires)
 */

// Helper: create a Supabase SSR client from cookies
async function createSupabaseSSRClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

// Helper: create an admin Supabase client (bypasses RLS for token ops)
function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { persistSession: false } }
    );
  }
  // Fallback to anon key if no service role key configured
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * GET — Generate a QR token for the authenticated user
 *
 * Returns a JSON payload to encode in the QR code:
 *   { token, userId, exp }
 *
 * The token is stored in `qr_tokens` with a 90-second TTL and can
 * only be redeemed once via the POST endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseSSRClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    // Generate cryptographically random token
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + 90_000; // 90 seconds

    // Store token in qr_tokens table
    const adminClient = createAdminClient();
    const { error: insertError } = await adminClient
      .from('qr_tokens')
      .insert({
        token,
        user_id: user.id,
        created_at: now,
        expires_at: expiresAt,
        redeemed: false,
      });

    if (insertError) {
      console.error('Failed to store QR token:', insertError);
      return NextResponse.json(
        { error: 'Failed to generate QR code' },
        { status: 500 }
      );
    }

    // Build the QR payload
    const qrPayload = {
      token,
      userId: user.id,
      exp: expiresAt,
    };

    // Also generate legacy URLs for backward compat display
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
        request.nextUrl.origin);

    const connectionUrl = `${baseUrl}/connect/${user.id}`;
    const clickId = `CLICK-${user.id.substring(0, 8).toUpperCase()}`;

    return NextResponse.json({
      success: true,
      data: {
        // New token-based payload (encode this as the QR code content)
        qrPayload: JSON.stringify(qrPayload),
        token,
        expiresAt,
        // Legacy fields for display
        userId: user.id,
        clickId,
        connectionUrl,
        deepLink: `click://connect/${user.id}`,
        universalLink: connectionUrl,
        userName: user.user_metadata?.full_name || null,
        userEmail: user.email,
      }
    });

  } catch (error) {
    console.error('QR API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST — Redeem a QR token and validate proximity
 *
 * Body: { token, scannerLocation?: { lat, lon } }
 *   OR legacy: { targetUserId }
 *
 * For token-based: atomically redeems the token via the `redeem_qr_token` RPC.
 * For legacy: validates the target user exists (backward compat).
 *
 * Returns:
 *   { userId, userName, tokenAgeMs } on success
 *   { error: "expired" | "already_used" | "not_found" } on failure
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseSSRClient();
    const body = await request.json();

    // Get the current user (the scanner)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    // ── Token-based redemption (new flow) ──
    if (body.token) {
      const { token, scannerLocation } = body;
      const adminClient = createAdminClient();

      // Atomically redeem the token via RPC
      const { data: rpcResult, error: rpcError } = await adminClient
        .rpc('redeem_qr_token', { p_token: token });

      if (rpcError) {
        console.error('Token redemption RPC error:', rpcError);
        return NextResponse.json(
          { error: 'Token validation failed' },
          { status: 500 }
        );
      }

      const result = rpcResult as { success: boolean; error?: string; user_id?: string; token_age_ms?: number };

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'not_found' },
          { status: 400 }
        );
      }

      const targetUserId = result.user_id!;
      const tokenAgeMs = result.token_age_ms || 0;

      // Prevent self-connection
      if (user.id === targetUserId) {
        return NextResponse.json(
          { error: 'Cannot connect with yourself' },
          { status: 400 }
        );
      }

      // Look up target user name
      const { data: targetUser } = await adminClient
        .from('users')
        .select('id, name')
        .eq('id', targetUserId)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        data: {
          targetUserId,
          targetUserName: targetUser?.name || 'Click User',
          initiatorId: user.id,
          tokenAgeMs,
          message: 'Token redeemed — ready to create connection',
        }
      });
    }

    // ── Legacy flow (old click://connect/{userId} format) ──
    const { targetUserId } = body;
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Missing token or targetUserId' },
        { status: 400 }
      );
    }

    // Prevent self-connection
    if (user.id === targetUserId) {
      return NextResponse.json(
        { error: 'Cannot connect with yourself' },
        { status: 400 }
      );
    }

    // Verify the target user exists
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id, name')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        targetUserId,
        targetUserName: targetUser.name || 'Click User',
        initiatorId: user.id,
        tokenAgeMs: null, // Legacy — no token timing data
        message: 'Ready to create connection',
      }
    });

  } catch (error) {
    console.error('QR Verify Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
