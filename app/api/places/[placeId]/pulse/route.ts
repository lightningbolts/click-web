import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/parseBody';
import { placePulseBodySchema } from '@/lib/api/schemas/places';
import { runAfterResponse } from '@/lib/server/afterResponse';
import { loadConsumerPlace } from '@/lib/server/places/loadPlace';
import { createPulse } from '@/lib/server/places/pulses';
import { placeNotFound, placesRateLimitResponse, requirePlacesUser } from '@/lib/server/places/routeContext';
import { emitProductEvent } from '@/lib/server/telemetry/productEvents';

/** POST /api/places/[placeId]/pulse — one Pulse from a present user (§5.5). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlacesUser(request);
    if (!ctx.ok) return ctx.response;
    const { admin, user, config } = ctx;
    const limited = await placesRateLimitResponse('pulse', user.id);
    if (limited) return limited;

    const parsed = await parseBody(request, placePulseBodySchema);
    if (!parsed.ok) return apiError('Invalid Pulse', 400, 'invalid_answer');

    const place = await loadConsumerPlace(admin, placeId);
    if (!place) return placeNotFound();

    const result = await createPulse(admin, { place, userId: user.id, body: parsed.data, config, nowMs: Date.now() });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code, ...result.extra }, { status: result.status });
    }
    const props = { has_energy: parsed.data.energy != null, has_followup: result.hasFollowup };
    runAfterResponse('place_pulse', () => emitProductEvent(admin, user.id, 'place_pulse', props));
    return NextResponse.json({ pulse: result.pulse, summary: result.summary }, { status: 201 });
  } catch (e) {
    console.error('POST /api/places/[placeId]/pulse:', e);
    return apiError('Internal Server Error', 500);
  }
}
