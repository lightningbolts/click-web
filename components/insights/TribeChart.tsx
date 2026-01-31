'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users2, Info } from 'lucide-react';
import { GlassPanel } from './InsightShell';
import type { TribeBubble } from '@/lib/insights/mockData';

interface TribeChartProps {
  tribes: TribeBubble[];
}

/**
 * TribeChart - Bubble chart showing interest clustering
 * Uses SVG to render interactive bubbles representing user tribes
 */
export default function TribeChart({ tribes }: TribeChartProps) {
  const [hoveredTribe, setHoveredTribe] = useState<TribeBubble | null>(null);
  const [selectedTribe, setSelectedTribe] = useState<TribeBubble | null>(null);

  // Normalize bubble sizes for visualization
  const normalizedTribes = useMemo(() => {
    const maxSize = Math.max(...tribes.map(t => t.size));
    const minRadius = 25;
    const maxRadius = 60;
    
    return tribes.map(tribe => ({
      ...tribe,
      radius: minRadius + (tribe.size / maxSize) * (maxRadius - minRadius),
    }));
  }, [tribes]);

  // Find overlapping tribes for connection lines
  const getOverlapLines = () => {
    const lines: { from: TribeBubble; to: TribeBubble }[] = [];
    
    normalizedTribes.forEach(tribe => {
      if (tribe.overlap) {
        tribe.overlap.forEach(overlapId => {
          const targetTribe = normalizedTribes.find(t => t.id === overlapId);
          if (targetTribe && !lines.some(l => 
            (l.from.id === tribe.id && l.to.id === overlapId) ||
            (l.to.id === tribe.id && l.from.id === overlapId)
          )) {
            lines.push({ from: tribe, to: targetTribe });
          }
        });
      }
    });
    
    return lines;
  };

  const overlapLines = getOverlapLines();

  return (
    <GlassPanel className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#C77DFF]/20 rounded-lg">
            <Users2 className="w-4 h-4 text-[#C77DFF]" />
          </div>
          <span className="text-sm font-medium text-zinc-400">Tribe Analysis</span>
        </div>
        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors group">
          <Info className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
        </button>
      </div>

      {/* Bubble Chart */}
      <div className="relative h-[320px] bg-[#0a0a0a] rounded-xl border border-white/5 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#8338EC]/5 via-transparent to-[#3A86FF]/5" />
        
        <svg 
          viewBox="0 0 100 100" 
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Connection lines for overlapping tribes */}
          {overlapLines.map((line, i) => (
            <motion.line
              key={`line-${i}`}
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.5"
              strokeDasharray="2 2"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.5 }}
              transition={{ duration: 1, delay: i * 0.1 }}
            />
          ))}

          {/* Tribe bubbles */}
          {normalizedTribes.map((tribe, index) => {
            const isHovered = hoveredTribe?.id === tribe.id;
            const isSelected = selectedTribe?.id === tribe.id;
            const isRelated = hoveredTribe?.overlap?.includes(tribe.id) || 
                            tribe.overlap?.includes(hoveredTribe?.id || '');
            
            // Scale radius for SVG viewBox
            const svgRadius = (tribe.radius / 300) * 100;
            
            return (
              <motion.g
                key={tribe.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ 
                  delay: index * 0.1,
                  type: 'spring',
                  stiffness: 200,
                  damping: 15,
                }}
              >
                {/* Glow effect */}
                <motion.circle
                  cx={tribe.x}
                  cy={tribe.y}
                  r={svgRadius + 2}
                  fill={tribe.color}
                  opacity={isHovered || isSelected ? 0.3 : 0.1}
                  animate={{
                    r: isHovered ? svgRadius + 4 : svgRadius + 2,
                    opacity: isHovered || isSelected ? 0.4 : isRelated ? 0.25 : 0.1,
                  }}
                  transition={{ duration: 0.3 }}
                  style={{ filter: 'blur(4px)' }}
                />
                
                {/* Main bubble */}
                <motion.circle
                  cx={tribe.x}
                  cy={tribe.y}
                  r={svgRadius}
                  fill={tribe.color}
                  opacity={isHovered || isSelected ? 0.9 : isRelated ? 0.7 : 0.5}
                  stroke={isHovered || isSelected ? 'white' : tribe.color}
                  strokeWidth={isHovered || isSelected ? 0.5 : 0.2}
                  className="cursor-pointer"
                  animate={{
                    scale: isHovered ? 1.1 : 1,
                  }}
                  transition={{ duration: 0.2 }}
                  onMouseEnter={() => setHoveredTribe(tribe)}
                  onMouseLeave={() => setHoveredTribe(null)}
                  onClick={() => setSelectedTribe(selectedTribe?.id === tribe.id ? null : tribe)}
                  style={{ 
                    transformOrigin: `${tribe.x}px ${tribe.y}px`,
                    filter: isHovered ? `drop-shadow(0 0 8px ${tribe.color})` : 'none',
                  }}
                />
                
                {/* Tribe label */}
                <text
                  x={tribe.x}
                  y={tribe.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={svgRadius > 8 ? 3.5 : 2.5}
                  fontWeight="bold"
                  className="pointer-events-none select-none"
                  style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}
                >
                  {tribe.name}
                </text>
                
                {/* Connection count */}
                <text
                  x={tribe.x}
                  y={tribe.y + (svgRadius > 8 ? 4 : 3)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.7)"
                  fontSize={2}
                  className="pointer-events-none select-none"
                >
                  {tribe.connections}
                </text>
              </motion.g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        <AnimatePresence>
          {hoveredTribe && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-3 left-3 right-3 bg-black/90 backdrop-blur-md p-3 rounded-xl border border-white/20 z-10"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: hoveredTribe.color }}
                  />
                  <span className="font-semibold text-white text-sm">{hoveredTribe.name}</span>
                </div>
                <span className="text-xs text-zinc-400">{hoveredTribe.size} members</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-zinc-300">
                  <span className="font-bold text-white">{hoveredTribe.connections}</span> connections
                </span>
                {hoveredTribe.overlap && hoveredTribe.overlap.length > 0 && (
                  <span className="text-zinc-400">
                    Overlaps with: {hoveredTribe.overlap.map(id => 
                      tribes.find(t => t.id === id)?.name
                    ).filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats row */}
      <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/10">
        <div className="text-xs text-zinc-400">
          <span className="text-white font-semibold">{tribes.length}</span> active tribes
        </div>
        <div className="text-xs text-zinc-400">
          <span className="text-white font-semibold">
            {tribes.reduce((acc, t) => acc + t.connections, 0)}
          </span> total connections
        </div>
      </div>
    </GlassPanel>
  );
}
