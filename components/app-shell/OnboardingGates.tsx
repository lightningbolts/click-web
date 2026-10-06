'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';
import { writeSessionCache } from '@/lib/dashboard/sessionCache';
import { useOnboardingGates } from '@/components/dashboard/useOnboardingGates';

const InterestTagging = dynamic(() => import('@/components/InterestTagging'), { ssr: false });
const BirthdayGate = dynamic(() => import('./BirthdayGate').then((m) => m.BirthdayGate), { ssr: false });

/**
 * Signed-in onboarding gates (interest tagging, the OAuth birthday gate) for every app route.
 * They used to live inside the legacy dashboard, so routes with their own pages skipped them.
 */
export function OnboardingGates() {
  const { user } = useAuth();
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [, setProfileConnectionId] = useState<string | null>(null);
  const { needsTagging, handleTagsComplete, handleTagsSkip, birthdayProfileGateOpen, setBirthdayProfileGateOpen } =
    useOnboardingGates({ user, getAuthHeaders: getFreshAuthHeaders, setProfileUserId, setProfileConnectionId });

  if (!user) return null;
  return (
    <>
      {needsTagging === true ? (
        <InterestTagging onComplete={handleTagsComplete} onSkip={handleTagsSkip} canSkip />
      ) : null}
      {birthdayProfileGateOpen && profileUserId === user.id ? (
        <BirthdayGate
          userId={user.id}
          onSaved={() => {
            writeSessionCache(user.id, 'birthdayPresent', true);
            setProfileUserId(null);
            setBirthdayProfileGateOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
