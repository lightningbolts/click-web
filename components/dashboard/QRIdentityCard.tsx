'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Copy, Check, Share2, Download, Loader2, RefreshCw, Clock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getSupabaseClient } from '@/lib/supabase';

interface QRIdentityCardProps {
  userId: string;
  userName?: string;
  userEmail?: string;
}

interface QRData {
  qrPayload: string;       // Token-bearing Universal/App Clip link; encode this in the QR
  connectionUrl: string;   // For display and fallback
  clickId: string;
  expiresAt: number;       // ms timestamp
}

const TOKEN_TTL_MS = 90_000; // 90 seconds
const QR_LOCATION_TIMEOUT_MS = 1_500;

async function resolveQrLocationParams(): Promise<string> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return '';

  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), QR_LOCATION_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timeout);
        resolve(pos);
      },
      () => {
        window.clearTimeout(timeout);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: QR_LOCATION_TIMEOUT_MS,
      },
    );
  });

  const lat = position?.coords.latitude;
  const lon = position?.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return '';

  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return `?${params.toString()}`;
}

/**
 * QRIdentityCard - Displays a time-bounded, single-use Click QR token
 *
 * Auto-refreshes every 90 seconds before the token expires.
 * The QR encodes a token-bearing Universal/App Clip link, which the mobile scanner
 * redeems server-side for proximity verification.
 */
export default function QRIdentityCard({ userId, userName, userEmail }: QRIdentityCardProps) {
  const [copied, setCopied] = useState(false);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(TOKEN_TTL_MS / 1000);
  const qrRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchToken = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const session = supabase
        ? (await supabase.auth.getSession()).data.session
        : null;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };
      const locationParams = await resolveQrLocationParams();
      const response = await fetch(`/api/qr${locationParams}`, { headers, credentials: 'include' });
      const data = await response.json();

      if (data.success && data.data?.qrPayload) {
        setQrData({
          qrPayload: data.data.qrPayload,
          connectionUrl: data.data.connectionUrl,
          clickId: data.data.clickId,
          expiresAt: data.data.expiresAt,
        });
        setSecondsLeft(Math.round(TOKEN_TTL_MS / 1000));
      } else {
        // Fallback: legacy static URL (no proximity verification)
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        setQrData({
          qrPayload: `${baseUrl}/connect/${userId}`,
          connectionUrl: `${baseUrl}/connect/${userId}`,
          clickId: `CLICK-${userId.substring(0, 8).toUpperCase()}`,
          expiresAt: Date.now() + TOKEN_TTL_MS,
        });
        setSecondsLeft(Math.round(TOKEN_TTL_MS / 1000));
      }
    } catch (err) {
      console.error('Failed to fetch QR token:', err);
      setError('Could not generate QR code. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  // Initial load
  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Auto-refresh 5 seconds before expiry
  useEffect(() => {
    if (!qrData) return;

    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const msUntilRefresh = TOKEN_TTL_MS - 5_000;
    refreshTimerRef.current = setTimeout(() => {
      fetchToken();
    }, msUntilRefresh);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [qrData, fetchToken]);

  // Countdown timer
  useEffect(() => {
    if (!qrData || loading) return;

    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [qrData, loading]);

  const clickId = qrData?.clickId || `CLICK-${userId.substring(0, 8).toUpperCase()}`;
  const qrContent = qrData?.qrPayload || '';

  // Color-code the timer: green → yellow → red
  const timerColor =
    secondsLeft > 45 ? '#22c55e' :
      secondsLeft > 20 ? '#f59e0b' :
        '#ef4444';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrData?.connectionUrl || clickId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    if (navigator.share && qrData?.connectionUrl) {
      try {
        await navigator.share({
          title: 'My Click ID',
          text: `Connect with me on Click! My ID: ${clickId}`,
          url: qrData.connectionUrl,
        });
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const handleDownload = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 256;
      canvas.height = 256;
      if (ctx) {
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 28, 28, 200, 200);
        const link = document.createElement('a');
        link.download = `click-qr-${clickId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl"
    >
      {/* Card background with gradient border */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC] via-[#3A86FF] to-[#8338EC] opacity-20" />
      <div className="absolute inset-[1px] bg-zinc-900 rounded-3xl" />

      {/* Content */}
      <div className="relative p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#8338EC]/20 rounded-xl">
              <QrCode className="w-5 h-5 text-[#8338EC]" />
            </div>
            <div>
              <h3 className="font-bold text-white">Your Click ID</h3>
              <p className="text-xs text-zinc-500">Single-use · expires in 90s</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              title="Share"
            >
              <Share2 className="w-4 h-4 text-zinc-400" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              title="Download QR"
            >
              <Download className="w-4 h-4 text-zinc-400" />
            </button>
            <button
              onClick={() => fetchToken(true)}
              disabled={refreshing}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-40"
              title="Refresh token"
            >
              <RefreshCw className={`w-4 h-4 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="relative">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/30 to-[#3A86FF]/30 blur-xl" />

            {/* QR Container */}
            <div ref={qrRef} className="relative bg-[#121212] p-4 rounded-2xl border border-white/10">
              <AnimatePresence mode="wait">
                {(loading || refreshing) ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-[200px] h-[200px] flex flex-col items-center justify-center gap-3"
                  >
                    <Loader2 className="w-8 h-8 text-[#8338EC] animate-spin" />
                    <p className="text-xs text-zinc-500">Generating secure token…</p>
                  </motion.div>
                ) : error ? (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-[200px] h-[200px] flex flex-col items-center justify-center gap-2 text-center"
                  >
                    <p className="text-xs text-red-400">{error}</p>
                    <button
                      onClick={() => fetchToken()}
                      className="text-xs text-[#8338EC] hover:underline"
                    >
                      Try again
                    </button>
                  </motion.div>
                ) : qrContent ? (
                  <motion.div
                    key={qrContent}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <QRCodeSVG
                      value={qrContent}
                      size={200}
                      level="M"
                      bgColor="#121212"
                      fgColor="#8338EC"
                      marginSize={0}
                      title={`Click QR Code for ${userName || userEmail || userId}`}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Center logo overlay */}
              {!loading && !refreshing && qrContent && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-[#121212] px-2 py-1 rounded-lg">
                    <span className="text-lg font-bold text-white tracking-wide">Click</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Countdown timer */}
        {!loading && !error && qrContent && (
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-3.5 h-3.5" style={{ color: timerColor }} />
            <span
              className="text-xs font-mono font-medium tabular-nums transition-colors"
              style={{ color: timerColor }}
            >
              {secondsLeft > 0 ? `${secondsLeft}s` : 'Refreshing…'}
            </span>
            <span className="text-xs text-zinc-600">· refreshes automatically</span>
          </div>
        )}

        {/* Click ID Display */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
            <code className="px-4 py-2 bg-zinc-800 rounded-xl text-[#8338EC] font-mono text-lg tracking-wider">
              {clickId}
            </code>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-500" />
              ) : (
                <Copy className="w-5 h-5 text-zinc-400" />
              )}
            </motion.button>
          </div>
          <p className="text-xs text-zinc-500 text-center">
            {copied ? 'Copied to clipboard!' : 'Share this ID or scan the QR code'}
          </p>
        </div>

        {/* User info */}
        {(userName || userEmail) && (
          <div className="pt-4 border-t border-zinc-800 text-center">
            {userName && <p className="text-white font-medium">{userName}</p>}
            {userEmail && <p className="text-xs text-zinc-500">{userEmail}</p>}
          </div>
        )}

        {/* Usage instructions */}
        <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-zinc-300">How to use:</p>
          <ul className="text-xs text-zinc-500 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-[#8338EC]">1.</span>
              <span>Show this QR code when meeting someone new</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#8338EC]">2.</span>
              <span>They scan it with the Click app; it expires in 90s</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#8338EC]">3.</span>
              <span>Important: each code is single-use!</span>
            </li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
