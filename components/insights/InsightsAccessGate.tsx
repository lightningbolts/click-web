'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-on-surface">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-on-surface">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fc-card max-w-md border-2 border-border-hard p-8 text-center"
      >
        <AlertCircle className="mx-auto mb-4 h-16 w-16 text-error" />
        <h1 className="mb-2 text-2xl font-bold text-on-surface">Access Denied</h1>
        <p className="mb-6 font-medium text-on-surface-variant">
          Business insights are only available to verified business partners. Use your personal
          dashboard to manage connections and settings.
        </p>
        <Link href="/" className="fc-btn-primary inline-block px-6 py-3">
          Go to your dashboard
        </Link>
      </motion.div>
    </div>
  );
}

type AccessPayload = { insightsAllowed: boolean };

const fetcher = (url: string) => fetchInsightsApiJson<AccessPayload>(url);

/**
 * Blocks /insights for consumers: redirects unauthenticated users home; shows access denied for
 * signed-in users without a business profile. Renders children only when allowed.
 */
export default function InsightsAccessGate({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const { data, error, isLoading } = useSWR(
    user ? '/api/user/insights-access' : null,
    fetcher,
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/');
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoadingScreen />;
  }

  if (isLoading && !error) {
    return <LoadingScreen />;
  }

  if (error || !data?.insightsAllowed) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
