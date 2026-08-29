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
        } else {
            setSelected([...selected, tag]);
        }
    };

    const toggleExpand = (label: string) => {
        setExpandedCategory(expandedCategory === label ? null : label);
    };

    const addCustomInterest = () => {
        const raw = customInterestInput.trim();
        if (!raw) return;
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
            <motion.div
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto scrollbar-hide"
            >
                <div
                  className="fc-card border border-border-hard p-8"
                  style={{ backgroundColor: 'var(--color-surface)' }}
                >
                    <div className="mb-6 text-center">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border-hard bg-on-primary-container px-3 py-1.5">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold text-primary">Quick Setup</span>
                        </div>
                        <h2 className="mb-2 text-3xl font-bold text-on-surface">What are you into?</h2>
                        <p className="text-sm font-medium text-on-surface-variant">
                            Pick at least {MIN_TAGS} interests. Tap a category to see subcategories.
                        </p>
                    </div>

                    <div className="mb-5 text-center">
                        <span className={`text-xs font-bold ${selected.length >= MIN_TAGS ? 'text-primary' : 'text-on-surface-variant'}`}>
                            {selected.length} selected
                            {selected.length < MIN_TAGS && ` (min ${MIN_TAGS})`}
                        </span>
                    </div>

                    <InterestGrid
                        selected={selected}
                        expandedCategory={expandedCategory}
                        onToggleTag={toggleTag}
                        onToggleExpand={toggleExpand}
                        maxTags={undefined}
                    />

                    <div className="mt-5 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Custom interests</p>
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
                                className="fc-input flex-1 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                            />
                            <button
                                onClick={addCustomInterest}
                                    disabled={customInterestInput.trim().length === 0}
                                className="fc-btn-secondary inline-flex items-center gap-1 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Plus className="w-4 h-4" /> Add
                            </button>
                        </div>

                        {customSelectedTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {customSelectedTags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="fc-chip inline-flex items-center gap-1 text-xs"
                                    >
                                        {tag}
                                        <button
                                            onClick={() => removeCustomInterest(tag)}
                                            className="rounded p-0.5 hover:bg-surface-container"
                                            aria-label={`Remove ${tag}`}
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mt-8 space-y-3">
                        <button
                            onClick={() => onComplete(selected)}
                            disabled={selected.length < MIN_TAGS}
                            className="fc-btn-primary w-full py-3 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            Continue
                        </button>
                        {canSkip && (
                            <button
                                onClick={onSkip}
                                className="w-full py-2.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
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
    maxTags?: number;
}

export function InterestGrid({ selected, expandedCategory, onToggleTag, onToggleExpand, maxTags }: InterestGridProps) {
    return (
        <div className="space-y-2">
            {/* 2-column grid — keeps labels fully readable at all viewport sizes */}
            <div className="grid grid-cols-2 gap-2">
                {INTEREST_CATEGORIES.map(({ emoji, label, subs }) => {
                    const isSelected = selected.includes(label);
                    const hasSelectedSubs = subs.some(s => selected.includes(s));
                    const isExpanded = expandedCategory === label;

                    return (
                        <div key={label} className="min-w-0">
                            <motion.div
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                className={`relative flex w-full cursor-pointer select-none items-center gap-2 rounded-[8px] border-2 px-3 py-2.5 text-sm font-bold transition-colors ${isSelected
                                        ? 'border-border-hard bg-on-primary-container text-primary'
                                        : hasSelectedSubs
                                            ? 'border-primary/40 bg-surface-container text-on-surface'
                                            : 'border-border-hard bg-surface text-on-surface hover:bg-surface-container-low'
                                    }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => onToggleTag(label)}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    aria-pressed={isSelected}
                                >
                                    <span>{emoji}</span>
                                    <span className="flex-1 truncate">{label}</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onToggleExpand(label); }}
                                    className="-my-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label} interests`}
                                    aria-expanded={isExpanded}
                                >
                                    {isExpanded
                                        ? <ChevronUp className="h-3.5 w-3.5 text-on-surface-variant" />
                                        : <ChevronDown className="h-3.5 w-3.5 text-on-surface-variant" />
                                    }
                                </button>
                                <AnimatePresence>
                                    {isSelected && (
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0 }}
                                            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary"
                                        >
                                            <Check className="h-2.5 w-2.5 text-on-primary" />
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
                                                        disabled={maxTags != null && !subSelected && selected.length >= maxTags}
                                                        className={`rounded-[8px] border-2 px-2.5 py-1 text-xs font-bold transition-colors ${subSelected
                                                            ? 'border-border-hard bg-on-primary-container text-primary'
                                                            : 'border-border-hard bg-surface text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface disabled:opacity-30'
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
