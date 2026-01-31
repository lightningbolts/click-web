'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Maximize2 } from 'lucide-react';
import { GlassPanel } from './InsightShell';
import type { HeatmapZone } from '@/lib/insights/mockData';

interface HeatmapViewProps {
  zones: HeatmapZone[];
}

/**
 * HeatmapView - Spatial heatmap showing venue floor plan with hot zones
 * Uses CSS Grid and SVG to create a mock floor plan visualization
 */
export default function HeatmapView({ zones }: HeatmapViewProps) {
  const [hoveredZone, setHoveredZone] = useState<HeatmapZone | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Get zone color based on intensity
  const getZoneColor = (intensity: number, type: HeatmapZone['type']) => {
    const baseColors = {
      bar: { r: 131, g: 56, b: 236 },    // Purple
      dance: { r: 255, g: 56, b: 100 },   // Pink/Red
      lounge: { r: 58, g: 134, b: 255 },  // Blue
      stage: { r: 255, g: 193, b: 7 },    // Gold
      entrance: { r: 100, g: 100, b: 100 }, // Gray
      vip: { r: 255, g: 107, b: 107 },    // Coral
    };
    
    const color = baseColors[type];
    const alpha = 0.2 + intensity * 0.6;
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
  };

  const getZoneGlow = (intensity: number, type: HeatmapZone['type']) => {
    const glowColors = {
      bar: '131, 56, 236',
      dance: '255, 56, 100',
      lounge: '58, 134, 255',
      stage: '255, 193, 7',
      entrance: '100, 100, 100',
      vip: '255, 107, 107',
    };
    
    return `0 0 ${20 + intensity * 30}px rgba(${glowColors[type]}, ${intensity * 0.5})`;
  };

  const getZoneIcon = (type: HeatmapZone['type']) => {
    const icons: Record<string, string> = {
      bar: '🍸',
      dance: '💃',
      lounge: '🛋️',
      stage: '🎤',
      entrance: '🚪',
      vip: '⭐',
    };
    return icons[type] || '📍';
  };

  return (
    <GlassPanel className="p-6 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#FF6B6B]/20 rounded-lg">
            <MapPin className="w-4 h-4 text-[#FF6B6B]" />
          </div>
          <span className="text-sm font-medium text-zinc-400">Spatial Heatmap</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <Maximize2 className="w-4 h-4 text-zinc-500" />
        </motion.button>
      </div>

      {/* Floor Plan Container */}
      <div 
        className={`relative bg-[#0a0a0a] rounded-xl border border-white/5 overflow-hidden transition-all duration-300 ${
          isExpanded ? 'h-[500px]' : 'h-[300px]'
        }`}
      >
        {/* Grid overlay */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
          }}
        />

        {/* Zones */}
        {zones.map((zone) => (
          <motion.div
            key={zone.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: Math.random() * 0.3 }}
            className="absolute cursor-pointer transition-all duration-300"
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.width}%`,
              height: `${zone.height}%`,
              backgroundColor: getZoneColor(zone.intensity, zone.type),
              boxShadow: getZoneGlow(zone.intensity, zone.type),
              borderRadius: '8px',
              border: `1px solid rgba(255,255,255,${0.1 + zone.intensity * 0.2})`,
            }}
            onMouseEnter={() => setHoveredZone(zone)}
            onMouseLeave={() => setHoveredZone(null)}
            whileHover={{ 
              scale: 1.02,
              zIndex: 10,
            }}
          >
            {/* Zone pulse effect for high intensity */}
            {zone.intensity > 0.7 && (
              <motion.div
                className="absolute inset-0 rounded-lg"
                animate={{
                  opacity: [0.5, 0.2, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{
                  backgroundColor: getZoneColor(0.3, zone.type),
                }}
              />
            )}
            
            {/* Zone label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg md:text-xl">{getZoneIcon(zone.type)}</span>
            </div>
            
            {/* Connection count badge */}
            <div className="absolute -top-2 -right-2 bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded-full text-[10px] font-medium border border-white/20">
              {zone.connections}
            </div>
          </motion.div>
        ))}

        {/* Tooltip */}
        <AnimatePresence>
          {hoveredZone && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-md p-4 rounded-xl border border-white/20 z-20"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getZoneIcon(hoveredZone.type)}</span>
                  <span className="font-semibold text-white">{hoveredZone.name}</span>
                </div>
                <span className="text-sm text-zinc-400 capitalize">{hoveredZone.type} area</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getZoneColor(1, hoveredZone.type) }}
                  />
                  <span className="text-sm text-zinc-300">
                    <span className="font-bold text-white">{hoveredZone.connections}</span> connections
                  </span>
                </div>
                <div className="text-sm text-zinc-400">
                  Heat: {Math.round(hoveredZone.intensity * 100)}%
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/10">
        {[
          { type: 'bar', label: 'Bar', color: '#8338EC' },
          { type: 'dance', label: 'Dance', color: '#FF3864' },
          { type: 'lounge', label: 'Lounge', color: '#3A86FF' },
          { type: 'vip', label: 'VIP', color: '#FF6B6B' },
        ].map((item) => (
          <div key={item.type} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}
