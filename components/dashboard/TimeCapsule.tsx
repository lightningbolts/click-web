'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  MapPin, 
  Users, 
  ChevronLeft, 
  ChevronRight,
  Star,
  Calendar,
  MessageCircle,
  TrendingUp,
} from 'lucide-react';
import type { ConnectionRecord } from './ConnectionTable';
import { MomentBlock } from '@/components/dashboard/MomentIndicators';

export interface TimelineChapter {
  id: string;
  title: string;
  dateRange: {
    start: Date;
    end: Date;
  };
  location?: string;
  connectionCount: number;
  description?: string;
  coverImage?: string;
  color?: string;
  highlights?: string[];
  /** The actual connections made during this chapter */
  connections?: ConnectionRecord[];
}

interface TimeCapsuleProps {
  chapters: TimelineChapter[];
  onChapterClick?: (chapter: TimelineChapter) => void;
  /** Called when the user clicks "Chat" on a person inside the detail panel */
  onConnectionClick?: (connection: ConnectionRecord) => void;
}

/**
 * TimeCapsule - Visual timeline showing distinct "Chapters" of your social journey
 * Part of the Digital Memory Box experience
 */
export default function TimeCapsule({ chapters, onChapterClick, onConnectionClick }: TimeCapsuleProps) {
  const [selectedChapter, setSelectedChapter] = useState<TimelineChapter | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [chapters]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 320;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScroll, 300);
    }
  };

  const formatDateRange = (start: Date, end: Date) => {
    const startStr = start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return startStr === endStr ? startStr : `${startStr} - ${endStr}`;
  };

  const getChapterColor = (index: number, customColor?: string) => {
    if (customColor) return customColor;
    const colors = [
      'from-[#8338EC] to-[#3A86FF]',
      'from-[#FF6B6B] to-[#FFE66D]',
      'from-[#06D6A0] to-[#118AB2]',
      'from-[#EF476F] to-[#8338EC]',
      'from-[#FFD93D] to-[#FF6B6B]',
      'from-[#3A86FF] to-[#06D6A0]',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#8338EC]/20 rounded-lg">
            <Clock className="w-4 h-4 text-[#8338EC]" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Time Capsule</h3>
            <p className="text-xs text-zinc-500">{chapters.length} chapters in your journey</p>
          </div>
        </div>
        
        {/* Scroll controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`p-2 rounded-lg border transition-all ${
              canScrollLeft 
                ? 'border-zinc-700 hover:border-[#8338EC] text-zinc-400 hover:text-white' 
                : 'border-zinc-800 text-zinc-700 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`p-2 rounded-lg border transition-all ${
              canScrollRight 
                ? 'border-zinc-700 hover:border-[#8338EC] text-zinc-400 hover:text-white' 
                : 'border-zinc-800 text-zinc-700 cursor-not-allowed'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-zinc-700 to-transparent -translate-y-1/2 z-0" />
        
        {/* Chapters */}
        <div 
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-4 overflow-x-auto scrollbar-hide py-8 px-4 -mx-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {chapters.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-center">
                <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500">Your chapters will appear here as you make memories</p>
              </div>
            </div>
          ) : (
            chapters.map((chapter, index) => (
              <motion.div
                key={chapter.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative flex-shrink-0 w-72"
              >
                {/* Timeline dot */}
                <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-4 z-10">
                  <motion.div
                    animate={{ scale: selectedChapter?.id === chapter.id ? 1.3 : 1 }}
                    className={`w-4 h-4 rounded-full bg-gradient-to-br ${getChapterColor(index, chapter.color)} shadow-lg`}
                    style={{ boxShadow: '0 0 12px rgba(131, 56, 236, 0.5)' }}
                  />
                </div>

                {/* Chapter card */}
                <motion.div
                  whileHover={{ y: -4, scale: 1.02 }}
                  onClick={() => {
                    setSelectedChapter(chapter);
                    onChapterClick?.(chapter);
                  }}
                  className={`
                    relative overflow-hidden rounded-2xl border cursor-pointer transition-all
                    ${selectedChapter?.id === chapter.id 
                      ? 'border-[#8338EC] shadow-[0_0_20px_rgba(131,56,236,0.3)]' 
                      : 'border-zinc-800 hover:border-zinc-700'}
                  `}
                >
                  {/* Gradient header */}
                  <div className={`h-24 bg-gradient-to-br ${getChapterColor(index, chapter.color)} p-4 relative`}>
                    <div className="absolute inset-0 bg-black/30" />
                    <div className="relative z-10">
                      <p className="text-xs text-white/70 mb-1">
                        {formatDateRange(chapter.dateRange.start, chapter.dateRange.end)}
                      </p>
                      <h4 className="font-bold text-white text-lg leading-tight line-clamp-2">
                        {chapter.title}
                      </h4>
                    </div>
                    
                    {/* Star badge for special chapters */}
                    {chapter.connectionCount >= 5 && (
                      <div className="absolute top-3 right-3">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="bg-zinc-900/80 backdrop-blur-sm p-4 space-y-3">
                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-zinc-400">
                        <Users className="w-4 h-4" />
                        <span>{chapter.connectionCount} connections</span>
                      </div>
                      {chapter.location && (
                        <div className="flex items-center gap-1 text-zinc-400">
                          <MapPin className="w-4 h-4" />
                          <span className="truncate max-w-[100px]">{chapter.location}</span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {chapter.description && (
                      <p className="text-xs text-zinc-500 line-clamp-2">
                        {chapter.description}
                      </p>
                    )}

                    {/* Highlights */}
                    {chapter.highlights && chapter.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {chapter.highlights.slice(0, 3).map((highlight, i) => (
                          <span 
                            key={i}
                            className="px-2 py-0.5 bg-zinc-800 rounded-full text-[10px] text-zinc-400"
                          >
                            {highlight}
                          </span>
                        ))}
                        {chapter.highlights.length > 3 && (
                          <span className="px-2 py-0.5 text-[10px] text-zinc-500">
                            +{chapter.highlights.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Selected chapter detail */}
      <AnimatePresence>
        {selectedChapter && (() => {
          const conns = selectedChapter.connections ?? [];
          const kept = conns.filter((c) => c.status === 'kept').length;
          const active = conns.filter((c) => c.status === 'active').length;
          const pending = conns.filter((c) => c.status === 'pending').length;
          const archived = conns.filter((c) => c.status === 'archived').length;
          const expired = conns.filter((c) => c.status === 'expired').length;

          // Unique active days
          const activeDays = new Set(conns.map(c =>
            c.dateMet.toISOString().split('T')[0]
          )).size;

          // Most-visited location
          const locationCounts: Record<string, number> = {};
          conns.forEach(c => { locationCounts[c.location] = (locationCounts[c.location] ?? 0) + 1; });
          const topLocation = Object.entries(locationCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0];

          return (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="glass p-5 rounded-2xl border border-zinc-800 space-y-5">
                {/* Panel header — label only, no duplicate title */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#8338EC]" />
                    <span className="text-sm font-semibold text-zinc-300">Chapter Breakdown</span>
                  </div>
                  <button
                    onClick={() => setSelectedChapter(null)}
                    className="text-zinc-500 hover:text-white transition-colors text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>

                {/* Activity stats — kept / pending / expired / active days */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {[
                    { label: 'Kept', value: kept, color: 'text-green-400', bg: 'bg-green-500/10' },
                    { label: 'Active', value: active, color: 'text-sky-300', bg: 'bg-sky-500/10' },
                    { label: 'Pending', value: pending, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { label: 'Archived', value: archived, color: 'text-zinc-400', bg: 'bg-zinc-700/30' },
                    { label: 'Expired', value: expired, color: 'text-zinc-500', bg: 'bg-zinc-800/40' },
                    { label: 'Active days', value: activeDays, color: 'text-[#8338EC]', bg: 'bg-[#8338EC]/10' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Most active location */}
                {topLocation && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/40 rounded-lg">
                    <MapPin className="w-3.5 h-3.5 text-[#8338EC] shrink-0" />
                    <p className="text-xs text-zinc-400">
                      Most active at{' '}
                      <span className="text-white font-medium">{topLocation}</span>
                      {Object.keys(locationCounts).length > 1 && (
                        <span className="text-zinc-600">
                          {' '}· {Object.keys(locationCounts).length} locations total
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* People list */}
                {conns.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      People met during this chapter
                    </p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin pr-1">
                      {conns.map((conn) => (
                        <div
                          key={conn.id}
                          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                        >
                          {/* Avatar */}
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8338EC] to-[#3A86FF] flex items-center justify-center text-[10px] font-bold shrink-0">
                            {conn.name.charAt(0).toUpperCase()}
                          </div>
                          {/* Name + location */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{conn.name}</p>
                            <p className="text-[10px] text-zinc-400 truncate">{conn.location}</p>
                            {(conn.context || conn.weatherSummary || conn.noiseSummary) && (
                              <div className="mt-1.5 border-t border-zinc-800/70 pt-1.5">
                                <MomentBlock
                                  compact
                                  context={conn.context}
                                  weatherSummary={conn.weatherSummary}
                                  noiseSummary={conn.noiseSummary}
                                  noiseCategory={conn.noiseCategory}
                                />
                              </div>
                            )}
                            {conn.encounters && conn.encounters.length > 1 ? (
                              <div className="mt-2 space-y-1.5 border-t border-zinc-800/60 pt-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                  You&apos;ve crossed paths {conn.encounters.length} times
                                </p>
                                <ul className="scrollbar-thin max-h-36 space-y-1 overflow-y-auto pr-1">
                                  {conn.encounters.map((enc) => (
                                    <li
                                      key={enc.id}
                                      className="flex flex-col rounded-md bg-zinc-950/60 px-2 py-1.5 text-[10px] text-zinc-400"
                                    >
                                      <span className="font-medium text-zinc-200">
                                        {enc.encounteredAt.toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                        })}
                                      </span>
                                      <span className="truncate">{enc.locationName}</span>
                                      {enc.contextTags.length > 0 ? (
                                        <span className="truncate text-[#C4B5FD]">
                                          {enc.contextTags.join(' · ')}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                          {/* Context tag */}
                          {conn.context && (
                            <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-[#8338EC]/10 text-[#8338EC] border border-[#8338EC]/20 shrink-0">
                              {conn.context}
                            </span>
                          )}
                          {/* Status */}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                              conn.status === 'kept'
                                ? 'bg-green-500/10 text-green-400'
                                : conn.status === 'active'
                                  ? 'bg-sky-500/10 text-sky-300'
                                  : conn.status === 'pending'
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : conn.status === 'archived' || conn.status === 'removed'
                                      ? 'bg-zinc-700/50 text-zinc-400'
                                      : 'bg-zinc-700/40 text-zinc-500'
                            }`}
                          >
                            {conn.status}
                          </span>
                          {/* Chat CTA — visible on hover */}
                          {onConnectionClick &&
                            conn.status !== 'expired' &&
                            conn.status !== 'archived' &&
                            conn.status !== 'removed' && (
                            <button
                              onClick={() => onConnectionClick(conn)}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-[#8338EC] text-white shrink-0 transition-opacity"
                            >
                              <MessageCircle className="w-3 h-3" /> Chat
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-2">
                    No detailed records for this chapter yet.
                  </p>
                )}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
