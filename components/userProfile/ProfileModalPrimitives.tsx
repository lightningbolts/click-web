'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export function ProfileLoadingSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-5 py-1"
      aria-busy
      aria-label="Loading profile"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-24 w-24 rounded-full border border-border-hard bg-surface-container animate-pulse" />
        <div className="h-5 w-40 rounded-[8px] bg-surface-container animate-pulse" />
        <div className="h-3 w-28 rounded-[8px] bg-surface-container animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-surface-container animate-pulse" />
        <div className="h-9 w-full rounded-[8px] bg-surface-container animate-pulse" />
        <div className="h-9 w-[80%] rounded-[8px] bg-surface-container animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-surface-container animate-pulse" />
        <div className="h-16 w-full rounded-[8px] bg-surface-container animate-pulse" />
      </div>
    </motion.div>
  );
}

export function EmptyTabState({
  Icon,
  title,
  body,
}: {
  Icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[12px] border border-border-hard bg-surface-container px-6 py-12 text-center">
      <Icon className="h-10 w-10 text-on-surface-variant" aria-hidden />
      <p className="mt-3 text-sm font-bold text-on-surface">{title}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{body}</p>
    </div>
  );
}
