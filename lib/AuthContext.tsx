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
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  onlineUserIds: new Set(),
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

  // Function to refresh user data from Supabase
  const refreshUser = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const { data: { user: freshUser }, error } = await supabase.auth.getUser();
      if (!error && freshUser) {
        setUser(freshUser);
      }
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (including USER_UPDATED and PASSWORD_RECOVERY events)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);

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
  }, []);

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
        // Always clear local state
        setUser(null);
      }
    } else {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, onlineUserIds, signOut, refreshUser }}>
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

