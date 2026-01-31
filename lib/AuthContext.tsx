'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

    // Listen for changes on auth state (including USER_UPDATED events)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Log auth events for debugging
      if (event === 'USER_UPDATED') {
        console.log('User data updated:', session?.user?.user_metadata);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        // Attempt to sign out from Supabase
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
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser }}>
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

