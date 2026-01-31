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
  Calendar
} from 'lucide-react';

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
}

interface TimeCapsuleProps {
  chapters: TimelineChapter[];
  onChapterClick?: (chapter: TimelineChapter) => void;
}

/**
 * TimeCapsule - Visual timeline showing distinct "Chapters" of your social journey
 * Part of the Digital Memory Box experience
 */
export default function TimeCapsule({ chapters, onChapterClick }: TimeCapsuleProps) {
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
        {selectedChapter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="glass p-6 rounded-2xl border-zinc-800">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-lg font-bold text-white">{selectedChapter.title}</h4>
                  <p className="text-sm text-zinc-400">
                    {formatDateRange(selectedChapter.dateRange.start, selectedChapter.dateRange.end)}
                    {selectedChapter.location && ` • ${selectedChapter.location}`}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedChapter(null)}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              
              {selectedChapter.description && (
                <p className="text-zinc-300 text-sm mb-4">{selectedChapter.description}</p>
              )}
              
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#8338EC]/20 rounded-lg">
                    <Users className="w-4 h-4 text-[#8338EC]" />
                  </div>
                  <div>
                    <p className="text-white font-semibold">{selectedChapter.connectionCount}</p>
                    <p className="text-xs text-zinc-500">People Met</p>
                  </div>
                </div>
                {selectedChapter.highlights && (
                  <div className="flex-1">
                    <p className="text-xs text-zinc-500 mb-1">Highlights</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedChapter.highlights.map((h, i) => (
                        <span key={i} className="px-2 py-1 bg-zinc-800 rounded-lg text-xs text-zinc-300">
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
