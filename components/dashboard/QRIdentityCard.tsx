'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Copy, Check, Share2, Download, Loader2, RefreshCw, Clock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getFreshAuthHeaders } from '@/lib/auth/freshAuthHeaders';

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

function readPrimaryColor(): string {
  if (typeof document === 'undefined') return '#7c3aed';
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
  return value || '#7c3aed';
}

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
  const [primaryColor, setPrimaryColor] = useState(readPrimaryColor);
  const qrRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPrimaryColor(readPrimaryColor());
  }, []);

  const fetchToken = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const headers = await getFreshAuthHeaders();
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
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-[16px]"
    >
      {/* Card background with gradient border */}
      <div className="absolute inset-0 bg-primary/20 opacity-100" />
      <div className="absolute inset-[1px] rounded-[16px] bg-surface-container" />

      {/* Content */}
      <div className="relative space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/20 p-2">
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-on-surface">Your Click ID</h3>
              <p className="text-xs text-on-surface-variant">Single-use · expires in 90s</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="rounded-lg p-2 transition-colors hover:bg-white/5"
              title="Share Click ID"
              aria-label="Share Click ID"
            >
              <Share2 className="h-4 w-4 text-on-surface-variant" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-lg p-2 transition-colors hover:bg-white/5"
              title="Download QR code"
              aria-label="Download QR code"
            >
              <Download className="h-4 w-4 text-on-surface-variant" />
            </button>
            <button
              type="button"
              onClick={() => fetchToken(true)}
              disabled={refreshing}
              className="rounded-lg p-2 transition-colors hover:bg-white/5 disabled:opacity-40"
              title="Refresh QR token"
              aria-label="Refresh QR token"
            >
              <RefreshCw className={`h-4 w-4 text-on-surface-variant ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/30 blur-xl" />

            <div ref={qrRef} className="relative rounded-2xl border border-border-hard bg-background p-4">
              <AnimatePresence mode="wait">
                {(loading || refreshing) ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex h-[200px] w-[200px] flex-col items-center justify-center gap-3"
                  >
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs text-on-surface-variant">Generating secure token…</p>
                  </motion.div>
                ) : error ? (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex h-[200px] w-[200px] flex-col items-center justify-center gap-2 text-center"
                  >
                    <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
                    <button
                      type="button"
                      onClick={() => fetchToken()}
                      className="text-xs text-primary hover:underline"
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
                      fgColor={primaryColor}
                      marginSize={0}
                      title={`Click QR Code for ${userName || userEmail || userId}`}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {!loading && !refreshing && qrContent && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-lg bg-background px-2 py-1">
                    <span className="text-lg font-bold tracking-wide text-on-surface">Click</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Countdown timer */}
        {!loading && !error && qrContent && (
          <div className="flex items-center justify-center gap-2">
            <Clock className="h-3.5 w-3.5" style={{ color: timerColor }} />
            <span
              className="font-mono text-xs font-medium tabular-nums transition-colors"
              style={{ color: timerColor }}
            >
              {secondsLeft > 0 ? `${secondsLeft}s` : 'Refreshing…'}
            </span>
            <span className="text-xs text-outline">· refreshes automatically</span>
          </div>
        )}

        {/* Click ID Display */}
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
            <code className="rounded-[8px] border border-border-hard bg-surface-container px-4 py-2 font-mono text-lg tracking-wider text-primary">
              {clickId}
            </code>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="rounded-xl bg-zinc-800 p-2 transition-colors hover:bg-zinc-700"
              title="Copy Click ID"
              aria-label="Copy Click ID"
            >
              {copied ? (
                <Check className="h-5 w-5 text-green-500" />
              ) : (
                <Copy className="h-5 w-5 text-on-surface-variant" />
              )}
            </motion.button>
          </div>
          <p className="text-center text-xs text-on-surface-variant">
            {copied ? 'Copied to clipboard!' : 'Share this ID or scan the QR code'}
          </p>
        </div>

        {/* User info */}
        {(userName || userEmail) && (
          <div className="border-t border-border-hard pt-4 text-center">
            {userName && <p className="font-medium text-on-surface">{userName}</p>}
            {userEmail && <p className="text-xs text-on-surface-variant">{userEmail}</p>}
          </div>
        )}

        {/* Usage instructions */}
        <div className="space-y-2 rounded-xl bg-zinc-800/50 p-4">
          <p className="text-xs font-medium text-on-surface-variant">How to use:</p>
          <ul className="space-y-1 text-xs text-on-surface-variant">
            <li className="flex items-start gap-2">
              <span className="text-primary">1.</span>
              <span>Show this QR code when meeting someone new</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">2.</span>
              <span>They scan it with the Click app; it expires in 90s</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">3.</span>
              <span>Important: each code is single-use!</span>
            </li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
