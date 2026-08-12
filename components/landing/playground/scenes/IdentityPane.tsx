'use client';

import { motion } from 'framer-motion';
import { Check, Clock, Copy, QrCode, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import DemoQr from '../DemoQr';
import { DEMO_CLICK_ID, DEMO_USER_NAME } from '../mockData';

const TOKEN_TTL_S = 90;

export default function IdentityPane() {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(72);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? TOKEN_TTL_S : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const timerColor = secondsLeft > 45 ? '#22c55e' : secondsLeft > 20 ? '#f59e0b' : '#ef4444';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(DEMO_CLICK_ID);
    } catch {
      /* demo */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Click ID',
          text: `Connect with me on Click! My ID: ${DEMO_CLICK_ID}`,
        });
        return;
      } catch {
        /* fall through */
      }
    }
    void copy();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mx-auto max-w-sm overflow-hidden rounded-[16px]"
    >
      <div className="absolute inset-0 bg-primary/20" />
      <div className="absolute inset-[1px] rounded-[16px] bg-surface-container" />
      <div className="relative space-y-6 p-6">
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
          <button
            type="button"
            onClick={() => void share()}
            className="rounded-lg p-2 text-on-surface-variant hover:bg-white/5"
            title="Share"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/30 blur-xl" />
            <div className="relative rounded-2xl border border-border-hard bg-[#121212] p-4">
              <DemoQr size={200} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Clock className="h-3.5 w-3.5" style={{ color: timerColor }} />
          <span className="font-mono text-xs font-medium tabular-nums" style={{ color: timerColor }}>
            {secondsLeft}s
          </span>
          <span className="text-xs text-outline">· refreshes automatically</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3">
            <code className="rounded-[8px] border border-border-hard bg-surface-container px-4 py-2 font-mono text-lg tracking-wider text-primary">
              {DEMO_CLICK_ID}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-xl bg-zinc-800 p-2 hover:bg-zinc-700"
              aria-label="Copy Click ID"
            >
              {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5 text-on-surface-variant" />}
            </button>
          </div>
          <p className="text-center text-xs text-on-surface-variant">
            {copied ? 'Copied to clipboard!' : 'Share this ID or scan the QR code'}
          </p>
        </div>

        <div className="border-t border-border-hard pt-4 text-center">
          <p className="font-medium text-on-surface">{DEMO_USER_NAME}</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Someone in the room scans this instead of hunting a handle.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
