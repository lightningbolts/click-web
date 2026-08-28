'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const VISIBLE_STARTER_COUNT = 5;

/** "Conversation starters" banner listing shared interest tags. Extracted verbatim from ChatView. */
export function ChatSharedInterestsBanner({
  isGroupClique,
  sharedInterestTags,
  peerUserId,
}: {
  isGroupClique: boolean;
  sharedInterestTags: string[];
  peerUserId: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflowCount = Math.max(0, sharedInterestTags.length - VISIBLE_STARTER_COUNT);
  const visibleTags = expanded
    ? sharedInterestTags
    : sharedInterestTags.slice(0, VISIBLE_STARTER_COUNT);

  return (
    <AnimatePresence>
      {!isGroupClique && sharedInterestTags.length > 0 && (
        <motion.div
          key={`conversation-starters-${peerUserId ?? 'unknown'}`}
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{
            type: 'spring',
            stiffness: 420,
            damping: 32,
            mass: 0.85,
          }}
          className="mb-3 shrink-0 overflow-hidden rounded-[16px] border-2 border-emerald-700/25 bg-emerald-500/10 px-4 py-3"
        >
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05, duration: 0.25 }}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200"
          >
            <motion.span
              initial={{ rotate: -12, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.08 }}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </motion.span>
            Conversation starters
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.2 }}
            className="mt-1 text-[11px] text-on-surface-variant"
          >
            Shared interests — try weaving one into your next message
          </motion.p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {visibleTags.map((t, i) => (
              <motion.span
                key={t}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 28,
                  delay: 0.14 + i * 0.045,
                }}
                className="rounded-full border border-border-hard bg-surface px-2.5 py-0.5 text-[11px] font-medium text-on-surface"
              >
                {t}
              </motion.span>
            ))}
            {overflowCount > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="rounded-full border border-border-hard bg-surface px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-surface-container"
                aria-expanded={expanded}
              >
                {expanded ? 'Show less' : `+${overflowCount} more`}
              </button>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
