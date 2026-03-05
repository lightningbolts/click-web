'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';

// ─── Shared interest taxonomy ───
export interface InterestCategory {
    emoji: string;
    label: string;
    subs: string[];
}

export const INTEREST_CATEGORIES: InterestCategory[] = [
    { emoji: '🎵', label: 'Music', subs: ['Live Shows', 'DJing', 'Producing', 'Guitar', 'Piano', 'Singing', 'Alto Sax', 'Tenor Sax', 'Drums', 'Violin', 'Bass', 'Songwriting'] },
    { emoji: '🎼', label: 'Instruments', subs: ['Alto Sax', 'Tenor Sax', 'Trumpet', 'Clarinet', 'Cello', 'Flute', 'Ukulele', 'Synth', 'Beat Making'] },
    { emoji: '🥾', label: 'Hiking', subs: ['Day Hikes', 'Backpacking', 'Trail Running', 'Rock Climbing', 'Scrambling', 'Nature Walks'] },
    { emoji: '☕', label: 'Coffee', subs: ['Espresso', 'Pour Over', 'Cafe Hopping', 'Latte Art', 'Home Brewing'] },
    { emoji: '🎮', label: 'Gaming', subs: ['PC', 'Console', 'Indie', 'Board Games', 'VR', 'Competitive', 'Co-op', 'RPG', 'Strategy'] },
    { emoji: '📚', label: 'Reading', subs: ['Fiction', 'Non-Fiction', 'Sci-Fi', 'Fantasy', 'Book Clubs', 'Poetry'] },
    { emoji: '💪', label: 'Fitness', subs: ['Gym', 'Yoga', 'CrossFit', 'Running', 'Swimming', 'Martial Arts', 'Pilates', 'Cycling'] },
    { emoji: '💻', label: 'Tech', subs: ['AI/ML', 'Web Dev', 'Mobile Dev', 'Cybersecurity', 'Hardware', 'Open Source', 'Cloud', 'Data Science'] },
    { emoji: '🎨', label: 'Art', subs: ['Painting', 'Sketching', 'Digital Art', 'Sculpture', 'Ceramics', 'Street Art', 'Calligraphy', 'Graphic Design'] },
    { emoji: '🎬', label: 'Film', subs: ['Indie Film', 'Horror', 'Documentaries', 'Animation', 'Film Making'] },
    { emoji: '🍕', label: 'Food', subs: ['Cooking', 'Baking', 'Food Trucks', 'Fine Dining', 'Vegan', 'BBQ', 'Sushi', 'Meal Prep'] },
    { emoji: '✈️', label: 'Travel', subs: ['Backpacking', 'Road Trips', 'City Breaks', 'Solo Travel', 'Camping', 'Digital Nomad', 'Hostels'] },
    { emoji: '👨‍💻', label: 'Coding', subs: ['Python', 'JavaScript', 'Rust', 'Hackathons', 'Side Projects', 'Kotlin', 'TypeScript', 'Game Dev'] },
    { emoji: '⚽', label: 'Sports', subs: ['Basketball', 'Soccer', 'Baseball', 'Football', 'Tennis', 'Volleyball', 'Skiing', 'Surfing'] },
    { emoji: '🏈', label: 'Team Sports', subs: ['Baseball', 'Football', 'Softball', 'Flag Football', 'Rugby', 'Ultimate Frisbee'] },
    { emoji: '🏃', label: 'Outdoor Sports', subs: ['Running', 'Cycling', 'Triathlon', 'Climbing', 'Skiing', 'Snowboarding', 'Surfing'] },
    { emoji: '🤝', label: 'Volunteering', subs: ['Environment', 'Education', 'Community', 'Animal Welfare', 'Mentoring'] },
    { emoji: '🚀', label: 'Startups', subs: ['Founding', 'VC/Finance', 'Product', 'Growth', 'Social Impact'] },
    { emoji: '📸', label: 'Photography', subs: ['Street', 'Portrait', 'Landscape', 'Film Photography', 'Drone', 'Concert Photography', 'Editing'] },
    { emoji: '🧘', label: 'Wellness', subs: ['Meditation', 'Mindfulness', 'Breathwork', 'Journaling', 'Mental Health'] },
    { emoji: '🗣️', label: 'Languages', subs: ['Spanish', 'French', 'Mandarin', 'Japanese', 'Korean', 'Language Exchange'] },
    { emoji: '🎭', label: 'Performing Arts', subs: ['Theater', 'Improv', 'Acting', 'Stand-up Comedy', 'Dance'] },
    { emoji: '🐶', label: 'Animals', subs: ['Dogs', 'Cats', 'Birds', 'Animal Rescue', 'Pet Training'] },
    { emoji: '🧩', label: 'Puzzles & Strategy', subs: ['Chess', 'Sudoku', 'Escape Rooms', 'Crosswords', 'Go'] },
];

const MIN_TAGS = 3;
const MAX_TAGS = 12;

interface InterestTaggingProps {
    onComplete: (tags: string[]) => void;
    onSkip: () => void;
    canSkip?: boolean;
    initialTags?: string[];
}

/**
 * Interest tagging onboarding overlay for web.
 * Supports main categories + expandable subcategories.
 */
export default function InterestTagging({ onComplete, onSkip, canSkip = true, initialTags = [] }: InterestTaggingProps) {
    const [selected, setSelected] = useState<string[]>(initialTags);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [customInterestInput, setCustomInterestInput] = useState('');

    const toggleTag = (tag: string) => {
        if (selected.includes(tag)) {
            setSelected(selected.filter((s) => s !== tag));
        } else if (selected.length < MAX_TAGS) {
            setSelected([...selected, tag]);
        }
    };

    const toggleExpand = (label: string) => {
        setExpandedCategory(expandedCategory === label ? null : label);
    };

    const addCustomInterest = () => {
        const raw = customInterestInput.trim();
        if (!raw) return;
        if (selected.length >= MAX_TAGS) return;

        const normalized = raw.toLowerCase();
        const exists = selected.some((s) => s.toLowerCase() === normalized);
        if (!exists) {
            setSelected([...selected, raw]);
        }
        setCustomInterestInput('');
    };

    const removeCustomInterest = (tag: string) => {
        setSelected(selected.filter((s) => s !== tag));
    };

    const predefinedTags = new Set(
        INTEREST_CATEGORIES.flatMap((category) => [category.label, ...category.subs])
            .map((tag) => tag.toLowerCase())
    );
    const customSelectedTags = selected.filter((tag) => !predefinedTags.has(tag.toLowerCase()));

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-xl flex items-center justify-center p-4"
        >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#8338EC] rounded-full blur-[180px] opacity-15" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#3A86FF] rounded-full blur-[180px] opacity-10" />
            </div>

            <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative z-10 max-w-lg w-full max-h-[85vh] overflow-y-auto scrollbar-hide"
            >
                <div className="glass rounded-3xl border border-zinc-800 p-8">
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#8338EC]/10 border border-[#8338EC]/20 mb-4">
                            <Sparkles className="w-4 h-4 text-[#8338EC]" />
                            <span className="text-xs text-[#8338EC] font-medium">Quick Setup</span>
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-2">What are you into?</h2>
                        <p className="text-zinc-400 text-sm">
                            Pick {MIN_TAGS}–{MAX_TAGS} interests. Tap a category to see subcategories.
                        </p>
                    </div>

                    <div className="text-center mb-5">
                        <span className={`text-xs font-medium ${selected.length >= MIN_TAGS ? 'text-[#8338EC]' : 'text-zinc-500'}`}>
                            {selected.length} / {MAX_TAGS} selected
                            {selected.length < MIN_TAGS && ` (min ${MIN_TAGS})`}
                        </span>
                    </div>

                    <InterestGrid
                        selected={selected}
                        expandedCategory={expandedCategory}
                        onToggleTag={toggleTag}
                        onToggleExpand={toggleExpand}
                        maxTags={MAX_TAGS}
                    />

                    <div className="mt-5 space-y-2">
                        <p className="text-xs uppercase tracking-wide text-zinc-500">Custom interests</p>
                        <div className="flex gap-2">
                            <input
                                value={customInterestInput}
                                onChange={(e) => setCustomInterestInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addCustomInterest();
                                    }
                                }}
                                placeholder="Add your own interest"
                                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#8338EC]"
                            />
                            <button
                                onClick={addCustomInterest}
                                disabled={selected.length >= MAX_TAGS || customInterestInput.trim().length === 0}
                                className="inline-flex items-center gap-1 rounded-lg border border-[#8338EC]/40 px-3 py-2 text-sm text-[#caa8ff] hover:bg-[#8338EC]/15 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-4 h-4" /> Add
                            </button>
                        </div>

                        {customSelectedTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {customSelectedTags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1 rounded-lg border border-[#3A86FF]/35 bg-[#3A86FF]/10 px-2 py-1 text-xs text-[#9bc8ff]"
                                    >
                                        {tag}
                                        <button
                                            onClick={() => removeCustomInterest(tag)}
                                            className="rounded p-0.5 hover:bg-white/10"
                                            aria-label={`Remove ${tag}`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 mt-8">
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

// ─── Shared grid component (used by both overlay and inline editor) ───

interface InterestGridProps {
    selected: string[];
    expandedCategory: string | null;
    onToggleTag: (tag: string) => void;
    onToggleExpand: (category: string) => void;
    maxTags: number;
}

export function InterestGrid({ selected, expandedCategory, onToggleTag, onToggleExpand, maxTags }: InterestGridProps) {
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {INTEREST_CATEGORIES.map(({ emoji, label, subs }) => {
                    const isSelected = selected.includes(label);
                    const hasSelectedSubs = subs.some(s => selected.includes(s));
                    const isExpanded = expandedCategory === label;

                    return (
                        <div key={label} className={isExpanded ? 'col-span-2 sm:col-span-4' : ''}>
                            <motion.div
                                role="button"
                                tabIndex={0}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => onToggleTag(label)}
                                className={`relative w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-sm font-medium cursor-pointer select-none ${isSelected
                                        ? 'bg-[#8338EC]/15 border-[#8338EC]/50 text-[#8338EC]'
                                        : hasSelectedSubs
                                            ? 'bg-[#8338EC]/5 border-[#8338EC]/20 text-zinc-200'
                                            : 'bg-white/5 border-zinc-700/50 text-zinc-300 hover:border-zinc-600'
                                    }`}
                            >
                                <span>{emoji}</span>
                                <span className="truncate flex-1 text-left">{label}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onToggleExpand(label); }}
                                    className="p-0.5 hover:bg-white/10 rounded transition-colors"
                                >
                                    {isExpanded
                                        ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                                        : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                                    }
                                </button>
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
                            </motion.div>

                            {/* Subcategories */}
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="flex flex-wrap gap-1.5 pt-2 pl-1">
                                            {subs.map((sub) => {
                                                const subSelected = selected.includes(sub);
                                                return (
                                                    <motion.button
                                                        key={sub}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => onToggleTag(sub)}
                                                        disabled={!subSelected && selected.length >= maxTags}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${subSelected
                                                            ? 'bg-[#8338EC]/20 border-[#8338EC]/40 text-[#8338EC]'
                                                            : 'bg-white/[0.03] border-zinc-800 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 disabled:opacity-30'
                                                            }`}
                                                    >
                                                        {sub}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
