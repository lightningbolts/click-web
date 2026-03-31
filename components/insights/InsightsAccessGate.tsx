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
    <div className="min-h-screen bg-[#121212] text-white flex items-center justify-center">
      <div className="h-10 w-10 rounded-full border-2 border-[#8338EC]/30 border-t-[#8338EC] animate-spin" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-[#121212] text-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl max-w-md text-center"
      >
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-zinc-400 mb-6">
          Business insights are only available to verified business partners. Use your personal
          dashboard to manage connections and settings.
        </p>
        <Link
          href="/"
          className="inline-block bg-[#8338EC] hover:bg-[#8338EC]/80 text-white px-6 py-3 rounded-xl transition-colors"
        >
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
