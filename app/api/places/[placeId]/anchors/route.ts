import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { publicOrigin } from '@/lib/events/eventUrls';
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
    if (!place.slug) return NextResponse.json({ anchors: [] });

    const { data, error } = await admin
      .from('nfc_anchors')
      .select('id, name, qr_token')
      .eq('venue_id', place.id)
      .eq('purpose', 'check_in')
      .eq('active', true)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    const base = publicOrigin();
    return NextResponse.json({
      anchors: ((data ?? []) as Array<{ id: string; name: string | null; qr_token: string }>).map((a) => ({
        id: a.id,
        name: a.name ?? 'Check-in code',
        check_in_url: `${base}/p/${place.slug}?t=${encodeURIComponent(a.qr_token)}`,
      })),
    });
  } catch (e) {
    console.error('GET /api/places/[placeId]/anchors:', e);
    return apiError('Internal Server Error', 500);
  }
}
