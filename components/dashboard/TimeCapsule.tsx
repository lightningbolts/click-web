'use client';

import { useState, useRef, useEffect, type ReactElement } from 'react';
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
  Volume2,
  Mountain,
  Sun,
  Moon,
  Battery,
  Compass,
  Activity,
} from 'lucide-react';
import type { ConnectionRecord } from './ConnectionTable';
import { MomentBlock } from '@/components/dashboard/MomentIndicators';
import { formatDetailedEncounterLocation } from '@/lib/location/detailedEncounterLocation';
import { CardVisualHero } from '@/components/ui/CardVisualSurface';
import { generateCardVisual } from '@/lib/ui/generateCardVisual';

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

function encounterTelemetryPills(enc: NonNullable<ConnectionRecord['encounters']>[number]) {
  const db =
    typeof enc.exactNoiseLevelDb === 'number' && Number.isFinite(enc.exactNoiseLevelDb)
      ? enc.exactNoiseLevelDb
      : null;
  const elevation =
    typeof enc.relativeAltitudeM === 'number' && Number.isFinite(enc.relativeAltitudeM)
      ? enc.relativeAltitudeM
      : typeof enc.exactBarometricElevationM === 'number' && Number.isFinite(enc.exactBarometricElevationM)
        ? enc.exactBarometricElevationM
        : null;
  const lux =
    typeof enc.luxLevel === 'number' && Number.isFinite(enc.luxLevel) && enc.luxLevel >= 0 ? enc.luxLevel : null;
  const motion =
    typeof enc.motionVariance === 'number' && Number.isFinite(enc.motionVariance) && enc.motionVariance >= 0
      ? enc.motionVariance
      : null;
  const azimuth =
    typeof enc.compassAzimuth === 'number' && Number.isFinite(enc.compassAzimuth) ? enc.compassAzimuth : null;
  const battery =
    typeof enc.batteryLevel === 'number' &&
    Number.isFinite(enc.batteryLevel) &&
    enc.batteryLevel >= 0 &&
    enc.batteryLevel <= 100
      ? enc.batteryLevel
      : null;

  return [
    db != null
      ? { key: 'db', icon: <Volume2 className="h-2.5 w-2.5 shrink-0 text-primary" aria-hidden />, label: `${Math.round(db)} dB` }
      : null,
    elevation != null
      ? { key: 'el', icon: <Mountain className="h-2.5 w-2.5 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden />, label: `${Math.round(elevation)} m` }
      : null,
    lux != null
      ? {
          key: 'lux',
          icon:
            lux < 15 ? (
              <Moon className="h-2.5 w-2.5 shrink-0 text-sky-200" aria-hidden />
            ) : (
              <Sun className="h-2.5 w-2.5 shrink-0 text-amber-800 dark:text-amber-300" aria-hidden />
            ),
          label: `${Math.round(lux)} lx`,
        }
      : null,
    battery != null
      ? { key: 'bat', icon: <Battery className="h-2.5 w-2.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />, label: `${Math.round(battery)}%` }
      : null,
    azimuth != null
      ? {
          key: 'az',
          icon: <Compass className="h-2.5 w-2.5 shrink-0 text-primary" aria-hidden />,
          label: `${Math.round(((azimuth % 360) + 360) % 360)}°`,
        }
      : null,
    motion != null
      ? { key: 'mv', icon: <Activity className="h-2.5 w-2.5 shrink-0 text-orange-700 dark:text-orange-300" aria-hidden />, label: motion.toFixed(2) }
      : null,
  ].filter((pill): pill is { key: string; icon: ReactElement; label: string } => pill != null);
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

  useEffect(() => {
    setSelectedChapter((cur) => {
      if (!cur) return cur;
      const next = chapters.find((c) => c.id === cur.id);
      return next ?? cur;
    });
  }, [chapters]);

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

  // Chapter colors come from the shared generator, seeded by chapter id, instead of a hand-rolled
  // index-based palette: a chapter then keeps the same identity as it moves in the timeline.
  const chapterVisual = (chapterId: string) => generateCardVisual(chapterId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-[8px] bg-on-primary-container p-2">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-on-surface">Time Capsule</h3>
            <p className="text-xs text-on-surface-variant">{chapters.length} chapters in your journey</p>
          </div>
        </div>
        
        {/* Scroll controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`p-2 rounded-lg border transition-all ${
              canScrollLeft 
                ? 'border-border-hard text-on-surface-variant hover:border-primary hover:text-on-surface' 
                : 'border-border-hard text-outline cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`p-2 rounded-lg border transition-all ${
              canScrollRight 
                ? 'border-border-hard text-on-surface-variant hover:border-primary hover:text-on-surface' 
                : 'border-border-hard text-outline cursor-not-allowed'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute top-1/2 left-0 right-0 z-0 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-outline to-transparent" />
        
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
                <Calendar className="w-12 h-12 text-outline mx-auto mb-3" />
                <p className="text-on-surface-variant">Your chapters will appear here as you make memories</p>
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
                    className="w-4 h-4 rounded-full shadow-lg"
                    style={{
                      background:
                        chapter.color ??
                        `linear-gradient(135deg, ${chapterVisual(chapter.id).gradient.join(', ')})`,
                      boxShadow: '0 0 12px rgba(131, 56, 236, 0.5)',
                    }}
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
                      ? 'border-primary shadow-none' 
                      : 'border-border-hard hover:border-border-hard'}
                  `}
                >
                  {/* Generated header — the scrim is contrast-searched, so bright hues stay legible */}
                  <CardVisualHero id={chapter.id} className="h-24">
                    <div className="h-full p-4">
                      <p className="mb-1 text-xs font-medium text-white/85">
                        {formatDateRange(chapter.dateRange.start, chapter.dateRange.end)}
                      </p>
                      <h4 className="line-clamp-2 text-lg font-bold leading-tight text-white">
                        {chapter.title}
                      </h4>
                    </div>

                    {/* Star badge for special chapters */}
                    {chapter.connectionCount >= 5 && (
                      <div className="absolute right-3 top-3">
                        <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" />
                      </div>
                    )}
                  </CardVisualHero>

                  {/* Content */}
                  <div className="space-y-3 bg-surface p-4">
                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-on-surface-variant">
                        <Users className="h-4 w-4" />
                        <span>{chapter.connectionCount} connections</span>
                      </div>
                      {chapter.location && (
                        <div className="flex items-center gap-1 text-on-surface-variant">
                          <MapPin className="h-4 w-4" />
                          <span className="max-w-[100px] truncate">{chapter.location}</span>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    {chapter.description && (
                      <p className="line-clamp-2 text-xs text-on-surface-variant">
                        {chapter.description}
                      </p>
                    )}

                    {/* Highlights */}
                    {chapter.highlights && chapter.highlights.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {chapter.highlights.slice(0, 3).map((highlight, i) => (
                          <span 
                            key={i}
                            className="rounded-full border border-border-hard bg-surface-container px-2 py-0.5 text-[10px] font-medium text-on-surface"
                          >
                            {highlight}
                          </span>
                        ))}
                        {chapter.highlights.length > 3 && (
                          <span className="px-2 py-0.5 text-[10px] text-on-surface-variant">
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
              <div className="fc-card p-5 rounded-2xl border border-border-hard space-y-5">
                {/* Panel header — label only, no duplicate title */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-on-surface-variant">Chapter Breakdown</span>
                  </div>
                  <button
                    onClick={() => setSelectedChapter(null)}
                    className="text-on-surface-variant hover:text-on-surface transition-colors text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>

                {/* Activity stats — kept / pending / expired / active days */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {[
                    { label: 'Kept', value: kept, color: 'text-green-700 dark:text-green-400', bg: 'bg-green-500/10' },
                    { label: 'Active', value: active, color: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-500/10' },
                    { label: 'Pending', value: pending, color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-500/10' },
                    { label: 'Archived', value: archived, color: 'text-on-surface-variant', bg: 'bg-surface-container' },
                    { label: 'Expired', value: expired, color: 'text-on-surface-variant', bg: 'bg-surface-container' },
                    { label: 'Active days', value: activeDays, color: 'text-primary', bg: 'bg-on-primary-container' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-[10px] text-on-surface-variant mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Most active location */}
                {topLocation && (
                  <div className="flex items-center gap-2 rounded-[8px] border border-border-hard bg-surface-container px-3 py-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <p className="text-xs text-on-surface-variant">
                      Most active at{' '}
                      <span className="font-medium text-on-surface">{topLocation}</span>
                      {Object.keys(locationCounts).length > 1 && (
                        <span className="text-outline">
                          {' '}· {Object.keys(locationCounts).length} locations total
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* People list */}
                {conns.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
                      People met during this chapter
                    </p>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin pr-1">
                      {conns.map((conn) => (
                        <div
                          key={conn.id}
                          className="group flex items-center gap-3 rounded-[8px] px-2 py-2 transition-colors hover:bg-surface-container"
                        >
                          {/* Avatar */}
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary">
                            {conn.name.charAt(0).toUpperCase()}
                          </div>
                          {/* Name + location */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-on-surface font-medium truncate">{conn.name}</p>
                            <p className="text-[10px] text-on-surface-variant truncate">{conn.location}</p>
                            {(conn.context || conn.weatherSummary || conn.noiseSummary) && (
                              <div className="mt-1.5 border-t border-border-hard/70 pt-1.5">
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
                              <div className="mt-2 space-y-1.5 border-t border-border-hard/60 pt-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                                  You&apos;ve crossed paths {conn.encounters.length} times
                                </p>
                                <ul className="scrollbar-thin max-h-36 space-y-1 overflow-y-auto pr-1">
                                  {conn.encounters.map((enc) => (
                                    (() => {
                                      const telemetryPills = encounterTelemetryPills(enc);
                                      return (
                                        <li
                                          key={enc.id}
                                          className="flex flex-col rounded-md bg-background/60 px-2 py-1.5 text-[10px] text-on-surface-variant"
                                        >
                                          <span className="font-medium text-on-surface">
                                            {enc.encounteredAt.toLocaleDateString('en-US', {
                                              month: 'short',
                                              day: 'numeric',
                                              year: 'numeric',
                                            })}
                                          </span>
                                          <span className="truncate">
                                            {formatDetailedEncounterLocation({
                                              locationName: enc.locationName,
                                              displayLocation: enc.displayLocation,
                                              semanticLocation: enc.semanticLocation,
                                            }) ?? enc.locationName ?? enc.displayLocation ?? 'A new location'}
                                          </span>
                                          {enc.contextTags.length > 0 ? (
                                            <span className="truncate text-primary">
                                              {enc.contextTags.join(' · ')}
                                            </span>
                                          ) : null}
                                          {telemetryPills.length > 0 ? (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                              {telemetryPills.map((pill) => (
                                                <span
                                                  key={pill.key}
                                                  className="inline-flex items-center gap-0.5 rounded-full border border-border-hard/80 bg-surface-container/90 px-1.5 py-0.5 text-[9px] font-medium text-on-surface"
                                                >
                                                  {pill.icon}
                                                  {pill.label}
                                                </span>
                                              ))}
                                            </div>
                                          ) : null}
                                        </li>
                                      );
                                    })()
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                          {/* Context tag */}
                          {conn.context && (
                            <span className="hidden shrink-0 rounded-full border border-primary/20 bg-on-primary-container px-2 py-0.5 text-[10px] font-medium text-primary sm:inline">
                              {conn.context}
                            </span>
                          )}
                          {/* Status */}
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                              conn.status === 'kept'
                                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                : conn.status === 'active'
                                  ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
                                  : conn.status === 'pending'
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                    : conn.status === 'archived' || conn.status === 'removed'
                                      ? 'bg-surface-container text-on-surface-variant'
                                      : 'bg-surface-container text-on-surface-variant'
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
                              className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-on-primary opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              <MessageCircle className="w-3 h-3" /> Chat
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-on-surface-variant text-center py-2">
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
