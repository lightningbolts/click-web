'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import LoadingScreen from '@/components/LoadingScreen';
import UserProfileModal from '@/components/UserProfileModal';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * Legacy `/dashboard` route: same post-login birthday gate as the main dashboard, then
 * forwards to `/` where [DashboardView] is mounted.
 */
export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profileChecked, setProfileChecked] = useState(false);
  const [needsBirthday, setNeedsBirthday] = useState(false);
  const [modalUserId, setModalUserId] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const supabase = getSupabaseClient();
    if (!supabase) return { 'Content-Type': 'application/json' };
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user?.id) {
      setProfileChecked(true);
      setNeedsBirthday(false);
      setModalUserId(null);
      return;
    }
    setProfileChecked(false);
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/profile`, { headers });
        const json = (await res.json().catch(() => ({}))) as { user?: { birthday?: string | null } };
        if (cancelled) return;
        const bd = json?.user?.birthday;
        const missing =
          !res.ok || bd == null || (typeof bd === 'string' && !bd.trim());
        if (missing) {
          setNeedsBirthday(true);
          setModalUserId(user.id);
        } else {
          setNeedsBirthday(false);
          setModalUserId(null);
        }
      } catch {
        if (!cancelled) {
          setNeedsBirthday(false);
          setModalUserId(null);
        }
      } finally {
        if (!cancelled) setProfileChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAuthHeaders, loading, user?.id]);

  useEffect(() => {
    if (loading || !profileChecked) return;
    if (!user) {
      router.replace('/');
      return;
    }
    if (!needsBirthday) {
      router.replace('/');
    }
  }, [loading, profileChecked, user, needsBirthday, router]);

  if (loading || !profileChecked) {
    return <LoadingScreen />;
  }

  if (user && needsBirthday && modalUserId) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <UserProfileModal
          userId={modalUserId}
          getAuthHeaders={getAuthHeaders}
          forceOwnProfileBirthdayCompletion
          onClose={() => {
            setModalUserId(null);
            setNeedsBirthday(false);
            router.replace('/');
          }}
        />
      </div>
    );
  }

  return <LoadingScreen />;
}
