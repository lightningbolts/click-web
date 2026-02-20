'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Users, Smartphone, ArrowRight, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

/**
 * Connect Page - Handles QR code scans
 * When someone scans a Click QR code, they land here
 * The page attempts to open the Click mobile app, or shows instructions
 */
export default function ConnectPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const [attemptedDeepLink, setAttemptedDeepLink] = useState(false);
  const [isValidUser, setIsValidUser] = useState<boolean | null>(null);

  // Generate the Click ID for display
  const clickId = userId ? `CLICK-${userId.substring(0, 8).toUpperCase()}` : '';

  useEffect(() => {
    if (!userId) return;

    // Attempt to open the Click mobile app via deep link
    const deepLink = `click://connect/${userId}`;
    
    // Try to open the deep link
    const timeout = setTimeout(() => {
      setAttemptedDeepLink(true);
    }, 2500);

    // Attempt to open the app
    window.location.href = deepLink;

    return () => clearTimeout(timeout);
  }, [userId]);

  // Verify the user exists
  useEffect(() => {
    if (!userId) return;

    const verifyUser = async () => {
      try {
        const response = await fetch('/api/qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: userId }),
        });
        const data = await response.json();
        setIsValidUser(response.ok && data.success);
      } catch {
        setIsValidUser(false);
      }
    };

    verifyUser();
  }, [userId]);

  if (!userId) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Link</h1>
          <p className="text-zinc-400">This connection link is invalid.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[150px] opacity-20" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#3A86FF] rounded-full blur-[150px] opacity-20" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 max-w-md w-full"
      >
        <div className="glass rounded-3xl border border-zinc-800 p-8 text-center">
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-[#8338EC] to-[#3A86FF] flex items-center justify-center">
              <Users className="w-10 h-10 text-white" />
            </div>
          </motion.div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white mb-2">
            Connect on Click
          </h1>
          <p className="text-zinc-400 mb-6">
            Someone wants to connect with you!
          </p>

          {/* Click ID */}
          <div className="bg-zinc-800/50 rounded-xl p-4 mb-6">
            <p className="text-xs text-zinc-500 mb-1">Click ID</p>
            <code className="text-[#8338EC] font-mono text-lg">{clickId}</code>
          </div>

          {attemptedDeepLink ? (
            <>
              {/* App not installed message */}
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-zinc-400">
                  <Smartphone className="w-5 h-5" />
                  <span className="text-sm">Don't have the Click app?</span>
                </div>

                {/* Download buttons */}
                <div className="space-y-3">
                  <a
                    href="https://apps.apple.com/app/click"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-white text-black rounded-xl font-medium hover:bg-zinc-200 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                    Download for iOS
                  </a>
                  
                  <a
                    href="https://play.google.com/store/apps/details?id=app.click"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-zinc-800 text-white rounded-xl font-medium hover:bg-zinc-700 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                    </svg>
                    Download for Android
                  </a>
                </div>

                {/* Or continue to website */}
                <div className="pt-4 border-t border-zinc-800">
                  <Link
                    href="/"
                    className="flex items-center justify-center gap-2 text-[#8338EC] hover:text-[#8338EC]/80 transition-colors"
                  >
                    <span>Learn more about Click</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </>
          ) : (
            /* Loading state while attempting to open app */
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 rounded-full bg-[#8338EC]"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 1, 0.5],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
              <p className="text-sm text-zinc-400">Opening Click app...</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
