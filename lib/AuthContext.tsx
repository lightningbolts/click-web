'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** User IDs with an active session on Realtime channel `room:presence` (see Supabase Presence). */
  onlineUserIds: ReadonlySet<string>;
  /** Public profile image URL from `public.users.image`, kept in sync for instant avatar updates. */
  profileImageUrl: string | null;
  setProfileImageUrl: (url: string | null) => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  onlineUserIds: new Set(),
  profileImageUrl: null,
  setProfileImageUrl: () => { },
  signOut: async () => { },
  refreshUser: async () => { },
});

const PRESENCE_CHANNEL = 'room:presence';
const PRESENCE_TRACK_MS = 25_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<string>>(() => new Set());
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  const loadProfileImageFromUsersTable = useCallback(async (userId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('users').select('image').eq('id', userId).maybeSingle();
      if (!error) {
        const url = data?.image;
        setProfileImageUrl(typeof url === 'string' && url.length > 0 ? url : null);
      }
    } catch (e) {
      console.error('Error loading profile image:', e);
    }
  }, []);

  // Function to refresh user data from Supabase
  const refreshUser = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: { user: freshUser }, error } = await supabase.auth.getUser();
      if (!error && freshUser) {
        setUser(freshUser);
        await loadProfileImageFromUsersTable(freshUser.id);
      }
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  }, [loadProfileImageFromUsersTable]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const userIdRef = { current: null as string | null };

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      userIdRef.current = u?.id ?? null;
      setUser(u);
      setLoading(false);
      if (u?.id) {
        void loadProfileImageFromUsersTable(u.id);
      } else {
        setProfileImageUrl(null);
      }
    });

    // Listen for changes on auth state (including USER_UPDATED and PASSWORD_RECOVERY events)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user ?? null;
      const nextId = next?.id ?? null;
      if (
        (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") &&
        nextId &&
        nextId === userIdRef.current
      ) {
        setLoading(false);
        return;
      }
      userIdRef.current = nextId;
      setUser(next);
      setLoading(false);
      if (next?.id) {
        void loadProfileImageFromUsersTable(next.id);
      } else {
        setProfileImageUrl(null);
      }

      // Log auth events for debugging
      if (event === 'USER_UPDATED') {
        console.log('User data updated:', session?.user?.user_metadata);
      }

      // Use router.replace instead of window.location.href so the client-side
      // Supabase session established by this PASSWORD_RECOVERY event is not
      // destroyed by a full-page reload before the reset form can use it.
      if (event === 'PASSWORD_RECOVERY') {
        if (!window.location.pathname.startsWith('/reset-password')) {
          router.replace('/reset-password');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfileImageFromUsersTable]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !user?.id) {
      setOnlineUserIds(new Set());
      return;
    }

    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: user.id } },
    });

    const syncFromChannel = () => {
      const state = channel.presenceState() as Record<string, { presence_ref?: string; user_id?: string; userId?: string }[]>;
      const ids = new Set<string>();
      for (const key of Object.keys(state)) {
        if (key) ids.add(key);
      }
      setOnlineUserIds(ids);
    };

    channel
      .on('presence', { event: 'sync' }, syncFromChannel)
      .on('presence', { event: 'join' }, syncFromChannel)
      .on('presence', { event: 'leave' }, syncFromChannel)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        const trackResult = await channel.track({ userId: user.id });
        if (trackResult !== 'ok') console.warn('Presence track:', trackResult);
        syncFromChannel();
        heartbeat = setInterval(() => {
          void channel.track({ userId: user.id });
        }, PRESENCE_TRACK_MS);
      });

    return () => {
      if (heartbeat) clearInterval(heartbeat);
      void channel.untrack();
      void supabase.removeChannel(channel);
      setOnlineUserIds(new Set());
    };
  }, [user?.id]);

  const signOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        // Sign out on server side first (clears cookies)
        await Promise.race([
          fetch('/api/auth/signout', { method: 'POST' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]);
        // Then sign out on client side
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]);
      } catch (error) {
        console.error('Sign out error or timeout:', error);
      } finally {
        setUser(null);
        setProfileImageUrl(null);
        router.replace('/');
        router.refresh();
      }
    } else {
      setUser(null);
      setProfileImageUrl(null);
      router.replace('/');
      router.refresh();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        onlineUserIds,
        profileImageUrl,
        setProfileImageUrl,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

