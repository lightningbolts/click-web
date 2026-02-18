'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { REACTION_EMOJIS } from '@/lib/chat/types';

interface ReactionPickerProps {
  /** Called with the clicked emoji */
  onReact: (emoji: string) => void;
  /** Emojis the current user has already reacted with */
  activeReactions?: string[];
  visible: boolean;
}

/**
 * ReactionPicker - floating emoji reaction bar
 * Appears above a message on hover / long-press.
 */
export default function ReactionPicker({ onReact, activeReactions = [], visible }: ReactionPickerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="absolute -top-11 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 
                     glass rounded-full px-2 py-1 shadow-xl"
        >
          {REACTION_EMOJIS.map((emoji) => {
            const isActive = activeReactions.includes(emoji);
            return (
              <button
                key={emoji}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
