'use client';

import { useMemo, type ElementType } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Music,
  Sparkles,
  Users,
  Coffee,
  TrendingUp,
} from 'lucide-react';
import { GlassPanel } from '@/components/insights/GlassPanel';
import VibeStream from '@/components/insights/VibeStream';
import { mockVenueInsights, type VibeMessage } from '@/lib/insights/mockData';
import { DemoBanner } from '@/components/insights/DemoBanner';
import { useInsightsDemo } from '@/components/insights/InsightsDemoContext';
import { useAuth } from '@/lib/AuthContext';
import { fetchInsightsApiJson } from '@/lib/insights/fetchInsightsApi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { useInsightsChartTheme } from '@/lib/theme/insightsChartTheme';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const CATEGORY_ICONS: Record<string, ElementType> = {
  music: Music,
  atmosphere: Sparkles,
  crowd: Users,
  service: Coffee,
  general: MessageSquare,
};

const CATEGORY_COLORS: Record<string, string> = {
  music: '#8338EC',
  atmosphere: '#FFD93D',
  crowd: '#3A86FF',
  service: '#06D6A0',
  general: '#FF6B6B',
};

const SENTIMENT_CONFIG = {
  positive: { color: '#22c55e', icon: ThumbsUp, label: 'Positive' },
  negative: { color: '#ef4444', icon: ThumbsDown, label: 'Negative' },
  neutral: { color: '#f59e0b', icon: Minus, label: 'Neutral' },
};

interface InsightsVibePayload {
  vibeMessages?: unknown[];
  status?: string;
}

const insightsFetcher = (url: string) =>
  fetchInsightsApiJson<InsightsVibePayload>(url);

export default function VibeStreamPage() {
  const chart = useInsightsChartTheme();
  const { demoMode } = useInsightsDemo();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const venueId = searchParams.get('venue_id') ?? undefined;
  const insightsUrl = user
    ? venueId
      ? `/api/insights/${venueId}`
      : '/api/insights/venue'
    : null;
  const { data: apiPayload } = useSWR(insightsUrl, insightsFetcher);

  const messages: VibeMessage[] = useMemo(() => {
    if (demoMode) return mockVenueInsights.vibeStream;
    const raw = apiPayload?.vibeMessages;
    if (!Array.isArray(raw)) return [];
    return raw.map((m: any, i: number) => ({
      id: typeof m?.id === 'string' ? m.id : `vibe-${i}`,
      message: typeof m?.message === 'string' ? m.message : '',
      sentiment: (m?.sentiment ?? 'neutral') as VibeMessage['sentiment'],
      category: (m?.category ?? 'general') as VibeMessage['category'],
      timestamp:
        m?.timestamp instanceof Date
          ? m.timestamp
          : new Date(
              typeof m?.timestamp === 'string' || typeof m?.timestamp === 'number'
                ? m.timestamp
                : Date.now(),
            ),
      icon: m?.icon,
    }));
  }, [demoMode, apiPayload?.vibeMessages]);

  // Sentiment counts
  const sentiment = {
    positive: messages.filter((m) => m.sentiment === 'positive').length,
    negative: messages.filter((m) => m.sentiment === 'negative').length,
    neutral: messages.filter((m) => m.sentiment === 'neutral').length,
  };
  const total = Math.max(messages.length, 1);
  const positiveRatio = Math.round((sentiment.positive / total) * 100);

  // Category distribution
  const categories = ['music', 'atmosphere', 'crowd', 'service', 'general'];
  const categoryData = categories.map((cat) => ({
    category: cat,
    count: messages.filter((m) => m.category === cat).length,
    color: CATEGORY_COLORS[cat],
  }));

  // Sentiment pie data
  const pieData = (['positive', 'negative', 'neutral'] as const).map((s) => ({
    name: SENTIMENT_CONFIG[s].label,
    value: sentiment[s],
    color: SENTIMENT_CONFIG[s].color,
  }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {demoMode ? (
        <motion.div variants={itemVariants}>
          <DemoBanner />
        </motion.div>
      ) : null}
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-[#FFD93D]/20 rounded-xl border border-[#FFD93D]/30">
          <MessageSquare className="w-5 h-5 text-[#FFD93D]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-on-surface">Vibe Stream</h2>
          <p className="text-sm text-on-surface-variant">
            Anonymous real-time sentiment from your venue visitors
          </p>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassPanel className="p-5" glow="green">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsUp className="w-4 h-4 text-green-700 dark:text-green-400" />
            <span className="text-xs text-on-surface-variant">Positive</span>
          </div>
          <div className="text-3xl font-bold text-green-700 dark:text-green-400">{sentiment.positive}</div>
          <div className="text-xs text-on-surface-variant mt-1">{Math.round((sentiment.positive / total) * 100)}% of messages</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ThumbsDown className="w-4 h-4 text-red-700 dark:text-red-400" />
            <span className="text-xs text-on-surface-variant">Negative</span>
          </div>
          <div className="text-3xl font-bold text-red-700 dark:text-red-400">{sentiment.negative}</div>
          <div className="text-xs text-on-surface-variant mt-1">{Math.round((sentiment.negative / total) * 100)}% of messages</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Minus className="w-4 h-4 text-amber-700 dark:text-amber-300" />
            <span className="text-xs text-on-surface-variant">Neutral</span>
          </div>
          <div className="text-3xl font-bold text-amber-700 dark:text-amber-300">{sentiment.neutral}</div>
          <div className="text-xs text-on-surface-variant mt-1">{Math.round((sentiment.neutral / total) * 100)}% of messages</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-[#8338EC]" />
            <span className="text-xs text-on-surface-variant">Vibe Score</span>
          </div>
          <div
            className="text-3xl font-bold"
            style={{ color: positiveRatio >= 60 ? '#22c55e' : positiveRatio >= 40 ? '#f59e0b' : '#ef4444' }}
          >
            {positiveRatio}%
          </div>
          <div className="text-xs text-on-surface-variant mt-1">positive overall</div>
        </GlassPanel>
      </motion.div>

      {/* Main row: vibe stream + sentiment pie */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Full-height vibe stream */}
        <div className="lg:col-span-2">
          <VibeStream messages={messages} />
        </div>

        {/* Sentiment breakdown */}
        <GlassPanel className="p-6 flex flex-col">
          <h3 className="text-base font-semibold text-on-surface mb-4">Sentiment Breakdown</h3>
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full h-[220px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chart.tooltipBg,
                      borderColor: chart.tooltipBorder,
                      borderRadius: '12px',
                      color: chart.tooltipText,
                    }}
                    itemStyle={{ color: chart.tooltipText }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-2 mt-2">
            {(['positive', 'negative', 'neutral'] as const).map((s) => (
              <div key={s} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: SENTIMENT_CONFIG[s].color }}
                  />
                  <span className="text-on-surface-variant capitalize">{s}</span>
                </div>
                <span className="text-on-surface font-medium">{sentiment[s]}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </motion.div>

      {/* Category distribution */}
      <motion.div variants={itemVariants}>
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-on-surface">Feedback by Category</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Which aspects of your venue generate the most feedback</p>
            </div>
          </div>
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
              <BarChart data={categoryData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="category"
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <YAxis
                  stroke={chart.axis}
                  tick={{ fill: chart.muted, fontSize: 11 }}
                  axisLine={{ stroke: chart.axis }}
                />
                <Tooltip
                  cursor={{ fill: chart.cursor }}
                  contentStyle={{
                    backgroundColor: chart.tooltipBg,
                    borderColor: chart.tooltipBorder,
                    borderRadius: '12px',
                    color: chart.tooltipText,
                  }}
                  itemStyle={{ color: chart.tooltipText }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Category legend with icons */}
          <div className="flex flex-wrap gap-3 mt-4">
            {categoryData.map(({ category, color }) => {
              const Icon = CATEGORY_ICONS[category] ?? MessageSquare;
              return (
                <div key={category} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                  <span className="capitalize">{category}</span>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}
