'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { parseConnectionEncounters } from '@/lib/dashboard/connectionEncounters';
import { isPriorSource } from '@/lib/insights/analytics';
import { computeFriendshipStats } from '@/lib/people/friendship';
import { fetchProfile, profileJson, profilePath } from '@/lib/people/profileClient';
import { coerceSharedConnection, displayName } from '@/lib/userProfile/profileDisplay';
import type { UserProfilePayload } from '@/lib/userProfile/profileModalTypes';

export { profilePath };

/** Profile, relationship and Together stats for `/people/[userId]` (spec §7.3). */
export function usePersonProfile(userId: string, currentUserId: string | null) {
  const path = profilePath(userId);
  const profile = useSWR<UserProfilePayload>(path, fetchProfile, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  const core = useSWR<{ core: string[] }>('/api/connections/core', profileJson, { revalidateOnFocus: false });
  const [nowMs] = useState(() => Date.now());

  const data = profile.data?.user?.id === userId ? profile.data : undefined;
  // The React Compiler memoizes these derivations.
  const sharedRaw = data?.sharedConnection ?? null;
  const shared = coerceSharedConnection(sharedRaw);
  const encounters = sharedRaw ? parseConnectionEncounters(sharedRaw as Record<string, unknown>) : [];
  const stats = computeFriendshipStats(encounters);

  const connectionId = shared?.id ?? null;
  const isPrior = isPriorSource(shared?.source);
  const pendingPrior = isPrior && shared?.status === 'pending';
  const canRespondPrior =
    pendingPrior &&
    !!currentUserId &&
    (shared?.responder_id === currentUserId || (!!shared?.initiator_id && shared.initiator_id !== currentUserId));

  const freeNow = (data?.availabilityIntents ?? []).some(
    (i) => /now|today/i.test(i.timeframe) && Date.parse(i.expires_at) > nowMs,
  );

  const sharedTags = data?.sharedInterestTags ?? [];
  const sharedLower = new Set(sharedTags.map((t) => t.toLowerCase()));
  const otherTags = (data?.tags ?? []).filter((t) => !sharedLower.has(t.toLowerCase()));

  return {
    path,
    data,
    error: profile.error as (Error & { status?: number }) | undefined,
    isLoading: !data && !profile.error,
    mutate: profile.mutate,
    name: data ? displayName(data.user) : '',
    firstName: data ? (data.user.first_name?.trim() || displayName(data.user).split(' ')[0]) : '',
    isSelf: !!currentUserId && currentUserId === userId,
    shared,
    connectionId,
    isConnected: !!connectionId && !pendingPrior,
    isPrior,
    pendingPrior,
    canRespondPrior,
    encounters,
    stats,
    isCore: !!connectionId && (core.data?.core ?? []).includes(connectionId),
    mutateCore: core.mutate,
    freeNow,
    sharedTags,
    otherTags,
  };
}

export type PersonProfileState = ReturnType<typeof usePersonProfile>;
