'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  Music, 
  Sparkles, 
  Users, 
  Coffee,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Filter
} from 'lucide-react';
import { GlassPanel } from './InsightsDashboard';
import type { VibeMessage } from '@/lib/insights/mockData';

interface VibeStreamProps {
  messages: VibeMessage[];
  autoScroll?: boolean;
}

/**
 * VibeStream - Live scrolling feed of anonymous venue feedback
 * Shows sentiment-colored feedback tags from venue visitors
 */
export default function VibeStream({ messages, autoScroll = true }: VibeStreamProps) {
  const [filter, setFilter] = useState<'all' | 'positive' | 'negative' | 'neutral'>('all');
  const [isHovered, setIsHovered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter messages
  const filteredMessages = messages.filter(msg => {
    if (filter === 'all') return true;
    return msg.sentiment === filter;
  });

  // Sentiment styling
  const getSentimentStyles = (sentiment: VibeMessage['sentiment']) => {
    switch (sentiment) {
      case 'positive':
        return {
          bg: 'bg-green-500/10',
          border: 'border-green-500/30',
          text: 'text-green-400',
          icon: ThumbsUp,
          glow: 'hover:shadow-[0_0_15px_rgba(34,197,94,0.2)]',
        };
      case 'negative':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          icon: ThumbsDown,
          glow: 'hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]',
        };
      default:
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          icon: Minus,
          glow: 'hover:shadow-[0_0_15px_rgba(245,158,11,0.2)]',
        };
    }
  };

  // Category icon mapping
  const getCategoryIcon = (category: VibeMessage['category']) => {
    const icons = {
      music: Music,
      atmosphere: Sparkles,
      crowd: Users,
      service: Coffee,
      general: MessageSquare,
    };
    return icons[category] || MessageSquare;
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Sentiment stats
  const stats = {
    positive: messages.filter(m => m.sentiment === 'positive').length,
    negative: messages.filter(m => m.sentiment === 'negative').length,
    neutral: messages.filter(m => m.sentiment === 'neutral').length,
  };

  const totalMessages = messages.length;
  const positiveRatio = totalMessages > 0 ? (stats.positive / totalMessages) * 100 : 0;

  return (
    <GlassPanel className="p-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#FFD93D]/20 rounded-lg">
            <MessageSquare className="w-4 h-4 text-[#FFD93D]" />
          </div>
          <span className="text-sm font-medium text-zinc-400">Vibe Stream</span>
        </div>
        
        {/* Filter dropdown */}
        <div className="relative group">
          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1">
            <Filter className="w-4 h-4 text-zinc-500" />
          </button>
          <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded-lg p-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[120px]">
            {(['all', 'positive', 'negative', 'neutral'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`w-full text-left px-3 py-1.5 text-xs rounded-md transition-colors capitalize ${
                  filter === f ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sentiment overview bar */}
      <div className="mb-4">
        <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(stats.positive / totalMessages) * 100}%` }}
            className="bg-green-500"
            transition={{ duration: 0.5 }}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(stats.neutral / totalMessages) * 100}%` }}
            className="bg-amber-500"
            transition={{ duration: 0.5, delay: 0.1 }}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(stats.negative / totalMessages) * 100}%` }}
            className="bg-red-500"
            transition={{ duration: 0.5, delay: 0.2 }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
          <span className="text-green-400">{stats.positive} positive</span>
          <span className="text-amber-400">{stats.neutral} neutral</span>
          <span className="text-red-400">{stats.negative} negative</span>
        </div>
      </div>

      {/* Messages list */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[400px] pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <AnimatePresence mode="popLayout">
          {filteredMessages.map((message, index) => {
            const styles = getSentimentStyles(message.sentiment);
            const CategoryIcon = getCategoryIcon(message.category);
            const SentimentIcon = styles.icon;

            return (
              <motion.div
                key={message.id}
                layout
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                transition={{ 
                  duration: 0.3,
                  delay: index * 0.02,
                  layout: { duration: 0.2 },
                }}
                className={`
                  p-3 rounded-xl border transition-all duration-200
                  ${styles.bg} ${styles.border} ${styles.glow}
                `}
              >
                <div className="flex items-start gap-3">
                  {/* Category icon */}
                  <div className={`p-1.5 rounded-lg ${styles.bg} flex-shrink-0`}>
                    <CategoryIcon className={`w-3.5 h-3.5 ${styles.text}`} />
                  </div>
                  
                  {/* Message content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-relaxed">
                      {message.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-zinc-500 capitalize">
                        {message.category}
                      </span>
                      <span className="text-[10px] text-zinc-600">•</span>
                      <span className="text-[10px] text-zinc-500">
                        {formatTime(message.timestamp)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Sentiment indicator */}
                  <div className={`p-1 rounded-full ${styles.bg} flex-shrink-0`}>
                    <SentimentIcon className={`w-3 h-3 ${styles.text}`} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Footer stats */}
      <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
        <div className="text-xs text-zinc-400">
          <span className="text-white font-semibold">{filteredMessages.length}</span> messages
          {filter !== 'all' && (
            <span className="ml-1">({filter})</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className={positiveRatio >= 50 ? 'text-green-400' : 'text-amber-400'}>
            {positiveRatio.toFixed(0)}%
          </span>
          <span className="text-zinc-500">positive vibes</span>
        </div>
      </div>
    </GlassPanel>
  );
}
