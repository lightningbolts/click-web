import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QrCode } from 'lucide-react';
import { CheckInPoster } from '@/components/business/CheckInPoster';
import { RefreshRetryRow } from '@/components/business/RefreshRetryRow';
import { EmptyState } from '@/components/ds/EmptyState';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadCheckInAnchors, type CheckInAnchor } from '@/lib/server/places/anchors';
import { loadWorkspace } from '@/lib/server/places/workspace';

export const metadata: Metadata = { title: 'Check-in QR · Business · Click', robots: { index: false } };

/** Check-in QR (spec §9.5): the poster once Click has verified the Place and made its code. */
export default async function PlaceQrPage({ params }: { params: Promise<{ placeId: string }> }) {
  const ws = await loadWorkspace((await params).placeId);
  if (ws.kind !== 'ok') notFound();
  const { place } = ws;
  if (place.verification_status !== 'verified') {
    return <EmptyState icon={QrCode} title="Your check-in QR appears after Click verifies your Place" body="We review every Place, usually within one business day." />;
  }
  let anchors: CheckInAnchor[] | null = null;
  try {
    anchors = await loadCheckInAnchors(createAdminSupabaseClient(), place);
  } catch (e) {
    console.error('[place qr]', e instanceof Error ? e.message : e);
  }
  if (anchors == null) return <RefreshRetryRow thing="your check-in codes" />;
  if (anchors.length === 0) {
    return <EmptyState icon={QrCode} title="Your check-in code is on its way" body="Click makes it right after verification. Check back soon, or contact Click." />;
  }
  return <CheckInPoster placeName={place.name} anchors={anchors} slugBase={place.slug ?? 'place'} />;
}
