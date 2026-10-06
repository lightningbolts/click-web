import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RefreshRetryRow } from '@/components/business/RefreshRetryRow';
import { Avatar } from '@/components/ds/Avatar';
import { StatusPill } from '@/components/ds/StatusPill';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadPlaceTeam, type TeamMember } from '@/lib/server/places/team';
import { loadWorkspace } from '@/lib/server/places/workspace';

export const metadata: Metadata = { title: 'Team · Business · Click', robots: { index: false } };

const ROLE = { owner: 'Owner', manager: 'Manager', viewer: 'Viewer' } as const;

/** Team (spec §9.5): who manages this Place. Inviting and role changes arrive with phase 5b. */
export default async function PlaceTeamPage({ params }: { params: Promise<{ placeId: string }> }) {
  const ws = await loadWorkspace((await params).placeId);
  if (ws.kind !== 'ok') notFound();
  const { place } = ws;
  let team: TeamMember[] | null = null;
  try {
    team = await loadPlaceTeam(createAdminSupabaseClient(), place.id, { includeEmail: place.role === 'owner' });
  } catch (e) {
    console.error('[place team]', e instanceof Error ? e.message : e);
  }
  if (!team) return <RefreshRetryRow thing="your team" />;
  return (
    <div className="max-w-[640px]">
      <ul className="overflow-hidden rounded-lg bg-surface dark:shadow-[inset_0_0_0_1px_var(--hairline)]" data-testid="team-list">
        {team.map((m) => (
          <li key={m.userId} className="flex min-h-16 items-center gap-3 px-4 py-2 shadow-[inset_0_1px_0_var(--hairline)] first:shadow-none">
            <Avatar seed={m.userId} name={m.name} src={m.avatarUrl} size={40} />
            <span className="min-w-0 flex-1">
              <span className="type-body-strong block truncate text-fg">
                {m.name}
                {m.userId === ws.userId ? <span className="type-meta font-normal text-fg-tertiary"> (you)</span> : null}
              </span>
              {m.email ? <span className="type-meta block truncate text-fg-tertiary">{m.email}</span> : null}
            </span>
            <StatusPill variant={m.role === 'owner' ? 'tinted' : 'neutral'}>{ROLE[m.role]}</StatusPill>
          </li>
        ))}
      </ul>
      <p className="type-meta mt-2 px-4 text-fg-tertiary">Contact Click to add people.</p>
    </div>
  );
}
