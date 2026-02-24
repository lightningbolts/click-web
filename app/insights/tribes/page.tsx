'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users2, Link2, TrendingUp, Info } from 'lucide-react';
import { GlassPanel } from '@/components/insights/InsightsDashboard';
import TribeChart from '@/components/insights/TribeChart';
import { mockTribes } from '@/lib/insights/mockData';
import type { TribeBubble } from '@/lib/insights/mockData';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function TribesPage() {
  const tribes: TribeBubble[] = mockTribes;
  const [selected, setSelected] = useState<TribeBubble | null>(null);

  const sorted = [...tribes].sort((a, b) => b.connections - a.connections);
  const totalConnections = tribes.reduce((s, t) => s + t.connections, 0);
  const avgConnections = Math.round(totalConnections / tribes.length);
  const mostOverlapping = tribes.reduce(
    (max, t) => ((t.overlap?.length ?? 0) > (max.overlap?.length ?? 0) ? t : max),
    tribes[0]
  );

  // Connections bar data (top 6)
  const barData = sorted.slice(0, 6).map((t) => ({
    name: t.name,
    count: t.connections,
    color: t.color,
  }));

  // Radar chart: each tribe's relative size vs connections
  const radarData = sorted.slice(0, 6).map((t) => ({
    subject: t.name,
    members: Math.round((t.size / Math.max(...tribes.map((x) => x.size))) * 100),
    connections: Math.round((t.connections / Math.max(...tribes.map((x) => x.connections))) * 100),
  }));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center gap-3 mb-2">
        <div className="p-2.5 bg-[#C77DFF]/20 rounded-xl border border-[#C77DFF]/30">
          <Users2 className="w-5 h-5 text-[#C77DFF]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Tribe Analysis</h2>
          <p className="text-sm text-zinc-500">Interest clustering and community overlap at your venue</p>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassPanel className="p-5" glow="purple">
          <div className="flex items-center gap-2 mb-3">
            <Users2 className="w-4 h-4 text-[#C77DFF]" />
            <span className="text-xs text-zinc-400">Total Tribes</span>
          </div>
          <div className="text-3xl font-bold text-white">{tribes.length}</div>
          <div className="text-xs text-zinc-500 mt-1">distinct communities</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-[#3A86FF]" />
            <span className="text-xs text-zinc-400">Total Connections</span>
          </div>
          <div className="text-3xl font-bold text-white">{totalConnections.toLocaleString()}</div>
          <div className="text-xs text-zinc-500 mt-1">cross-tribe networking</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-xs text-zinc-400">Avg / Tribe</span>
          </div>
          <div className="text-3xl font-bold text-white">{avgConnections}</div>
          <div className="text-xs text-zinc-500 mt-1">connections per group</div>
        </GlassPanel>

        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-zinc-400">Most Overlap</span>
          </div>
          <div className="text-xl font-bold text-white">{mostOverlapping?.name ?? '—'}</div>
          <div className="text-xs text-zinc-500 mt-1">
            {mostOverlapping?.overlap?.length ?? 0} tribe connections
          </div>
        </GlassPanel>
      </motion.div>

      {/* Full tribe chart */}
      <motion.div variants={itemVariants}>
        <TribeChart tribes={tribes} />
      </motion.div>

      {/* Bottom row */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Tribe leaderboard */}
        <GlassPanel className="p-6">
          <h3 className="text-base font-semibold text-white mb-4">Tribe Leaderboard</h3>
          <div className="space-y-3">
            {sorted.map((tribe, i) => (
              <motion.div
                key={tribe.id}
                whileHover={{ x: 2 }}
                onClick={() => setSelected(selected?.id === tribe.id ? null : tribe)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                  selected?.id === tribe.id
                    ? 'bg-white/10 border border-white/20'
                    : 'hover:bg-white/5'
                }`}
              >
                <span className="text-xs font-bold text-zinc-500 w-4">{i + 1}</span>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tribe.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium truncate">{tribe.name}</span>
                    <span className="text-xs text-zinc-400 ml-2 flex-shrink-0">
                      {tribe.connections} connections
                    </span>
                  </div>
                  {selected?.id === tribe.id && tribe.overlap && (
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Overlaps with: {tribe.overlap.join(', ')}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </GlassPanel>

        {/* Connection count bar chart */}
        <GlassPanel className="p-6">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-white">Top Tribes by Connections</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Connections formed within each community</p>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="rgba(255,255,255,0.15)"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="rgba(255,255,255,0.15)"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    backgroundColor: 'rgba(10,10,10,0.95)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                  }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}
