import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RefreshRetryRow } from '@/components/business/RefreshRetryRow';
import { TeamManager } from '@/components/business/TeamManager';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadPendingInvites } from '@/lib/server/places/invites';
import { loadPlaceTeam } from '@/lib/server/places/team';
import { loadWorkspace } from '@/lib/server/places/workspace';

export const metadata: Metadata = { title: 'Team · Business · Click', robots: { index: false } };

/** Team (spec §9.5): who manages this Place; owners invite, change roles and remove. */
export default async function PlaceTeamPage({ params }: { params: Promise<{ placeId: string }> }) {
  const ws = await loadWorkspace((await params).placeId);
  if (ws.kind !== 'ok') notFound();
  const { place } = ws;
  const owner = place.role === 'owner';
  const admin = createAdminSupabaseClient();
  let data: { team: Awaited<ReturnType<typeof loadPlaceTeam>>; invites: Awaited<ReturnType<typeof loadPendingInvites>> } | null = null;
  try {
    const [team, invites] = await Promise.all([
      loadPlaceTeam(admin, place.id, { includeEmail: owner }),
      owner ? loadPendingInvites(admin, place.id) : Promise.resolve([]),
    ]);
    data = { team, invites };
  } catch (e) {
    console.error('[place team]', e instanceof Error ? e.message : e);
  }
  if (!data) return <RefreshRetryRow thing="your team" />;
  return (
    <TeamManager
      placeId={place.id}
      viewerId={ws.userId}
      isOwner={owner}
      initialTeam={data.team.map(({ userId, name, avatarUrl, role, email }) => ({ userId, name, avatarUrl, role, email }))}
      initialInvites={data.invites.map(({ id, email, role, expired }) => ({ id, email, role, expired }))}
    />
  );
}
