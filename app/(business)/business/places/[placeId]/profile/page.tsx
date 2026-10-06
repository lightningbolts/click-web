import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlaceProfileForm } from '@/components/business/PlaceProfileForm';
import { loadWorkspace, toWorkspacePlace } from '@/lib/server/places/workspace';

export const metadata: Metadata = { title: 'Profile · Business · Click', robots: { index: false } };

export default async function PlaceProfilePage({ params }: { params: Promise<{ placeId: string }> }) {
  const ws = await loadWorkspace((await params).placeId);
  if (ws.kind !== 'ok') notFound();
  return <PlaceProfileForm place={toWorkspacePlace(ws.place)} />;
}
