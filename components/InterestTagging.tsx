'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';

const INTEREST_OPTIONS = [
    { emoji: '🎵', label: 'Music' },
    { emoji: '🥾', label: 'Hiking' },
    { emoji: '☕', label: 'Coffee' },
    { emoji: '🎮', label: 'Gaming' },
    { emoji: '📚', label: 'Reading' },
    { emoji: '💪', label: 'Fitness' },
    { emoji: '💻', label: 'Tech' },
    { emoji: '🎨', label: 'Art' },
    { emoji: '🎬', label: 'Film' },
    { emoji: '🍕', label: 'Food' },
    { emoji: '✈️', label: 'Travel' },
    { emoji: '👨‍💻', label: 'Coding' },
    { emoji: '⚽', label: 'Sports' },
    { emoji: '🤝', label: 'Volunteering' },
    { emoji: '🚀', label: 'Startups' },
    { emoji: '📸', label: 'Photography' },
];

const MIN_TAGS = 3;
const MAX_TAGS = 7;

interface InterestTaggingProps {
    onComplete: (tags: string[]) => void;
    onSkip: () => void;
    canSkip?: boolean;
}

/**
 * Interest tagging onboarding overlay for web.
 * Mirrors the mobile InterestTaggingScreen: 16 chips, 3-7 selection.
 */
export default function InterestTagging({ onComplete, onSkip, canSkip = true }: InterestTaggingProps) {
    const [selected, setSelected] = useState<string[]>([]);

    const toggle = (label: string) => {
        if (selected.includes(label)) {
            setSelected(selected.filter((s) => s !== label));
        } else if (selected.length < MAX_TAGS) {
            setSelected([...selected, label]);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-xl flex items-center justify-center p-4"
        >
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[180px] opacity-15" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#3A86FF] rounded-full blur-[180px] opacity-10" />
            </div>

            <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative z-10 max-w-lg w-full"
            >
                <div className="glass rounded-3xl border border-zinc-800 p-8">
                    {/* Header */}
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#8338EC]/10 border border-[#8338EC]/20 mb-4">
                            <Sparkles className="w-4 h-4 text-[#8338EC]" />
                            <span className="text-xs text-[#8338EC] font-medium">Quick Setup</span>
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">What are you into?</h2>
                        <p className="text-zinc-400 text-sm">
                            Pick {MIN_TAGS}–{MAX_TAGS} interests to find common ground with your connections
                        </p>
                    </div>

                    {/* Selection count */}
                    <div className="text-center mb-5">
                        <span className={`text-xs font-medium ${selected.length >= MIN_TAGS ? 'text-[#8338EC]' : 'text-zinc-500'}`}>
                            {selected.length} / {MAX_TAGS} selected
                            {selected.length < MIN_TAGS && ` (min ${MIN_TAGS})`}
                        </span>
                    </div>

                    {/* Interest chips grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8">
                        {INTEREST_OPTIONS.map(({ emoji, label }) => {
                            const isSelected = selected.includes(label);
                            return (
                                <motion.button
                                    key={label}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={() => toggle(label)}
                                    className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-sm font-medium ${isSelected
                                            ? 'bg-[#8338EC]/15 border-[#8338EC]/50 text-[#8338EC]'
                                            : 'bg-white/5 border-zinc-700/50 text-zinc-300 hover:border-zinc-600'
                                        }`}
                                >
                                    <span>{emoji}</span>
                                    <span className="truncate">{label}</span>
                                    <AnimatePresence>
                                        {isSelected && (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                exit={{ scale: 0 }}
                                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#8338EC] flex items-center justify-center"
                                            >
                                                <Check className="w-2.5 h-2.5 text-white" />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Actions */}
                    <div className="space-y-3">
                        <button
                            onClick={() => onComplete(selected)}
                            disabled={selected.length < MIN_TAGS}
                            className="w-full py-3 bg-gradient-to-r from-[#8338EC] to-[#6d28d9] text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            Continue
                        </button>
                        {canSkip && (
                            <button
                                onClick={onSkip}
                                className="w-full py-2.5 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                            >
                                Skip for now
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
