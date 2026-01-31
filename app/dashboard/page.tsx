'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import LoadingScreen from '@/components/LoadingScreen';

/**
 * Dashboard Route - Redirects to base URL
 * 
 * The dashboard content is now served at the base URL (/) when logged in.
 * This page provides backward compatibility by redirecting to /.
 */
export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // Always redirect to base URL - dashboard content is now there
      router.replace('/');
    }
  }, [user, loading, router]);

  // Show loading while checking auth and redirecting
  return <LoadingScreen />;
}
