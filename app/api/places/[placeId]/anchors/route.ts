import { NextRequest, NextResponse } from 'next/server';
import { loadCheckInAnchors } from '@/lib/server/places/anchors';
import { apiError } from '@/lib/api/errors';
import { requirePlaceManagerContext } from '@/lib/server/places/routeContext';

/**
 * GET /api/places/[placeId]/anchors — active check-in QR anchors for the printable poster (§5.9).
 * The token appears only in the check-in URL the poster encodes; never in share links.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const ctx = await requirePlaceManagerContext(request, placeId);
    if (!ctx.ok) return ctx.response;
    const { admin, place } = ctx;
    return NextResponse.json({ anchors: await loadCheckInAnchors(admin, place) });
  } catch (e) {
    console.error('GET /api/places/[placeId]/anchors:', e);
    return apiError('Internal Server Error', 500);
  }
}
