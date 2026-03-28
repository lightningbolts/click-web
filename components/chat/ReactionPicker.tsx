'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import data from '@emoji-mart/data';
import { motion, AnimatePresence } from 'framer-motion';
import { REACTION_EMOJIS } from '@/lib/chat/types';

const Picker = dynamic(() => import('@emoji-mart/react').then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[200px] items-center justify-center text-xs text-zinc-500">Loading picker…</div>
  ),
});

interface ReactionPickerProps {
  onReact: (emoji: string) => void;
  activeReactions?: string[];
  visible: boolean;
}

/**
 * Quick reactions + full Unicode search via emoji-mart (React 19: install with --legacy-peer-deps).
 */
export default function ReactionPicker({ onReact, activeReactions = [], visible }: ReactionPickerProps) {
  const [showFull, setShowFull] = useState(false);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="absolute -top-11 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1"
        >
          <div
            className="flex items-center gap-1 glass rounded-full px-2 py-1 shadow-xl"
            onMouseLeave={() => setShowFull(false)}
          >
            {REACTION_EMOJIS.map((emoji) => {
              const isActive = activeReactions.includes(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(emoji);
                  }}
                  className={`text-lg leading-none p-1 rounded-full transition-transform hover:scale-125 
                  ${isActive ? 'bg-[#8338EC]/30 ring-1 ring-[#8338EC]' : 'hover:bg-white/10'}`}
                >
                  {emoji}
                </button>
              );
            })}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowFull((v) => !v);
              }}
              className="text-xs font-semibold px-2 py-1 rounded-full text-zinc-300 hover:bg-white/10"
            >
              +
            </button>
          </div>
          {showFull && (
            <div
              className="mt-1 w-[min(100vw-32px,360px)] h-[min(52vh,380px)] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Picker
                data={data}
                theme="dark"
                previewPosition="none"
                skinTonePosition="search"
                onEmojiSelect={(e: { native: string }) => {
                  onReact(e.native);
                  setShowFull(false);
                }}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
