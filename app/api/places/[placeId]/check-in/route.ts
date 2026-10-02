import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { placeCheckInBodySchema } from '@/lib/api/schemas/places';
import { evaluateGpsProof, evaluateQrProof, type CheckInAnchor } from '@/lib/places/geofence';
import { runAfterResponse } from '@/lib/server/afterResponse';
import {
  checkInState,
  hereNowCountForPlace,
  loadActiveCheckIn,
  performCheckIn,
  performCheckOut,
} from '@/lib/server/places/checkIns';
import { loadConsumerPlace } from '@/lib/server/places/loadPlace';
import { placeNotFound, placesRateLimitResponse, requirePlacesUser } from '@/lib/server/places/routeContext';
import { emitProductEvent } from '@/lib/server/telemetry/productEvents';

type Ctx = { params: Promise<{ placeId: string }> };

const REJECT_COPY: Record<string, string> = {
  no_location: 'Turn on location to check in.',
  low_accuracy: "We couldn't get a precise location.",
  out_of_bounds: "You're not at this Place yet.",
  invalid_anchor: 'This code is no longer active.',
};

/**
 * POST — check in with GPS or a QR anchor token (§5.4). Rejected attempts store nothing but an
 * anonymous reason in telemetry. GET — the active check-in. DELETE — check out (idempotent).
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlacesUser(request);
    if (!ctx.ok) return ctx.response;
    const { admin, user, config } = ctx;
    const limited = await placesRateLimitResponse('check_in', user.id);
    if (limited) return limited;

    const parsed = await parseBody(request, placeCheckInBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const place = await loadConsumerPlace(admin, placeId);
    if (!place) return placeNotFound();

    const coords = { lat: body.latitude ?? null, lng: body.longitude ?? null, accuracy: body.accuracy_meters ?? null };
    let proof;
    if (body.anchor_token) {
      const { data, error } = await admin
        .from('nfc_anchors')
        .select('id, venue_id, purpose, active')
        .eq('qr_token', body.anchor_token)
        .maybeSingle();
      // A malformed token (not a uuid) is a lookup error, not a server error.
      const anchor = error ? null : (data as CheckInAnchor | null);
      proof = evaluateQrProof({ place, anchor, ...coords, config });
    } else {
      proof = evaluateGpsProof({ place, ...coords, config });
    }

    if (!proof.ok) {
      const reason = proof.reason;
      runAfterResponse('place_check_in_rejected', () => emitProductEvent(admin, user.id, 'place_check_in_rejected', { reason }));
      return NextResponse.json(
        {
          error: REJECT_COPY[reason] ?? 'Check-in rejected',
          code: reason,
          ...(proof.distance_meters != null ? { distance_meters: proof.distance_meters } : {}),
        },
        { status: 422 },
      );
    }

    const result = await performCheckIn(admin, {
      place,
      userId: user.id,
      proof,
      shareWithConnections: body.share_with_connections,
      platform: body.platform ?? null,
      appVersion: body.app_version ?? null,
      config,
      nowMs: Date.now(),
    });
    runAfterResponse('place_check_in', () => emitProductEvent(admin, user.id, 'place_check_in', { proof: result.proof }));
    return NextResponse.json(result);
  } catch (e) {
    console.error('POST /api/places/[placeId]/check-in:', e);
    return apiError('Internal Server Error', 500);
  }
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlacesUser(request);
    if (!ctx.ok) return ctx.response;
    const { admin, user } = ctx;

    const place = await loadConsumerPlace(admin, placeId);
    if (!place) return placeNotFound();

    const nowMs = Date.now();
    const active = await loadActiveCheckIn(admin, place.id, user.id, nowMs);
    if (!active) return NextResponse.json({ checked_in: false });
    const state = checkInState(active);
    let hubId: string | null = null;
    if (place.hub_enabled) {
      const { data } = await admin.from('hub_venues').select('id').eq('place_id', place.id).maybeSingle();
      hubId = (data as { id?: string } | null)?.id ?? null;
    }
    return NextResponse.json({
      checked_in: true,
      refreshed: false,
      check_in_id: state.check_in_id,
      checked_in_at: state.checked_in_at,
      expires_at: state.expires_at,
      proof: state.proof,
      share_with_connections: state.share_with_connections,
      hub_id: hubId,
      here_now_count: await hereNowCountForPlace(admin, place.id, user.id, nowMs),
    });
  } catch (e) {
    console.error('GET /api/places/[placeId]/check-in:', e);
    return apiError('Internal Server Error', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlacesUser(request);
    if (!ctx.ok) return ctx.response;
    const { admin, user, config } = ctx;

    const place = await loadConsumerPlace(admin, placeId);
    if (!place) return placeNotFound();

    return NextResponse.json(await performCheckOut(admin, { placeId: place.id, userId: user.id, config, nowMs: Date.now() }));
  } catch (e) {
    console.error('DELETE /api/places/[placeId]/check-in:', e);
    return apiError('Internal Server Error', 500);
  }
}
