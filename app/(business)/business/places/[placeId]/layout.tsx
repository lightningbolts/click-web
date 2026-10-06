import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { PlaceWorkspaceProvider } from '@/components/business/PlaceWorkspaceContext';
import { WorkspaceHeader } from '@/components/business/WorkspaceHeader';
import { loadWorkspace, toWorkspacePlace } from '@/lib/server/places/workspace';
import { loginHref } from '@/lib/shell/appNav';

export const dynamic = 'force-dynamic';

/**
 * The Place workspace (spec §9.3): one server guard per request (React `cache`), then the header,
 * switcher and tabs over every tab page. Non-managers get the not-found page.
 */
export default async function PlaceWorkspaceLayout({ params, children }: { params: Promise<{ placeId: string }>; children: ReactNode }) {
  const { placeId } = await params;
  const ws = await loadWorkspace(placeId);
  if (ws.kind === 'signed-out') redirect(loginHref(`/business/places/${placeId}`));
  if (ws.kind === 'not-manager') notFound();
  return (
    <PlaceWorkspaceProvider value={{ place: toWorkspacePlace(ws.place), places: ws.places.map(toWorkspacePlace) }}>
      <WorkspaceHeader />
      <div className="container-wide pb-16 pt-6 md:pt-8">{children}</div>
    </PlaceWorkspaceProvider>
  );
}
