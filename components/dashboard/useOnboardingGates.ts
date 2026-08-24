'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Dashboard onboarding gates: the interest-tagging overlay (a missing
 * `user_interests` row) and the OAuth birthday gate (missing
 * `public.users.birthday` blocks the dashboard until saved). Extracted
 * verbatim from DashboardView.
 */
export function useOnboardingGates({
  user,
  getAuthHeaders,
  setProfileUserId,
  setProfileConnectionId,
}: {
  user: any;
  getAuthHeaders: () => Promise<HeadersInit>;
  setProfileUserId: Dispatch<SetStateAction<string | null>>;
  setProfileConnectionId: Dispatch<SetStateAction<string | null>>;
}) {
  const [needsTagging, setNeedsTagging] = useState<boolean | null>(null);
  /** OAuth / incomplete `public.users.birthday` — blocks dashboard until saved (see UserProfileModal). */
  const [birthdayProfileGateResolved, setBirthdayProfileGateResolved] = useState(false);
  const [birthdayProfileGateOpen, setBirthdayProfileGateOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setBirthdayProfileGateResolved(true);
      setBirthdayProfileGateOpen(false);
      return;
    }
    setBirthdayProfileGateResolved(false);
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/profile`, { headers });
        const json = (await res.json().catch(() => ({}))) as { user?: { birthday?: string | null } };
        if (cancelled) return;
        const bd = json?.user?.birthday;
        const missing =
          !res.ok ||
          bd == null ||
          (typeof bd === 'string' && !bd.trim());
        if (missing) {
          setBirthdayProfileGateOpen(true);
          setProfileConnectionId(null);
          setProfileUserId(user.id);
        } else {
          setBirthdayProfileGateOpen(false);
        }
      } catch {
        if (!cancelled) {
          setBirthdayProfileGateOpen(false);
        }
      } finally {
        if (!cancelled) setBirthdayProfileGateResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAuthHeaders, user?.id]);

  useEffect(() => {
    if (user) {
      // A row in public.user_interests means the user completed or skipped interest onboarding.
      const checkUserInterestsRow = async () => {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setNeedsTagging(false);
          return;
        }
        try {
          const { data, error } = await supabase
            .from('user_interests')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (error) {
            setNeedsTagging(false);
            return;
          }
          setNeedsTagging(data == null);
        } catch {
          setNeedsTagging(false);
        }
      };
      checkUserInterestsRow();
    }
  }, [user]);

  const handleTagsComplete = async (tags: string[]) => {
    const supabase = getSupabaseClient();
    if (supabase) {
      const updatedAt = Date.now();
      const { error } = await supabase.from('user_interests').upsert(
        { user_id: user.id, tags, updated_at: updatedAt },
        { onConflict: 'user_id' },
      );
      if (error) {
        console.error('user_interests upsert failed:', error.message || error);
      }
    }
    setNeedsTagging(false);
  };

  const handleTagsSkip = async () => {
    setNeedsTagging(false);
    const supabase = getSupabaseClient();
    if (supabase) {
      const updatedAt = Date.now();
      try {
        await supabase.from('user_interests').upsert(
          { user_id: user.id, tags: [], updated_at: updatedAt },
          { onConflict: 'user_id' },
        );
      } catch (e) {
        console.error('user_interests skip upsert failed:', e);
      }
    }
  };

  return {
    needsTagging,
    handleTagsComplete,
    handleTagsSkip,
    birthdayProfileGateResolved,
    birthdayProfileGateOpen,
    setBirthdayProfileGateOpen,
  };
}
