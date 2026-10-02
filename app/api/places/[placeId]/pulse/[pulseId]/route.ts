import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { placePulsePatchBodySchema } from '@/lib/api/schemas/places';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { loadConsumerPlace } from '@/lib/server/places/loadPlace';
import { patchPulse } from '@/lib/server/places/pulses';
import { placeNotFound, placesRateLimitResponse, requirePlacesUser } from '@/lib/server/places/routeContext';
import { emitProductEvent } from '@/lib/server/telemetry/productEvents';

/** PATCH — fill a still-empty follow-up on the caller's own Pulse inside the edit window (§5.5). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ placeId: string; pulseId: string }> },
) {
  try {
    const { placeId, pulseId } = await params;
    const ctx = await requirePlacesUser(request);
    if (!ctx.ok) return ctx.response;
    const { admin, user, config } = ctx;
    const limited = await placesRateLimitResponse('pulse', user.id);
    if (limited) return limited;

    const parsed = await parseBody(request, placePulsePatchBodySchema);
    if (!parsed.ok) return apiError('Invalid Pulse', 400, 'invalid_answer');

    const place = await loadConsumerPlace(admin, placeId);
    if (!place) return placeNotFound();

    const result = await patchPulse(admin, { place, userId: user.id, pulseId, body: parsed.data, config, nowMs: Date.now() });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code, ...result.extra }, { status: result.status });
    }
    runAfterResponse('place_pulse', () =>
      emitProductEvent(admin, user.id, 'place_pulse', { has_energy: false, has_followup: true }),
    );
    return NextResponse.json({ summary: result.summary });
  } catch (e) {
    console.error('PATCH /api/places/[placeId]/pulse/[pulseId]:', e);
    return apiError('Internal Server Error', 500);
  }
}
