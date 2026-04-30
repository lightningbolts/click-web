'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

/**
 * Paths under `public/landing/`. Export filenames did not match UI content; keys are semantic.
 * overview → enterprise-insights-overview.png (Overview KPIs)
 * environment → enterprise-insights-map-view.png (Environment & flow section)
 * heatmapGrid → enterprise-vibe-radar.png (multi-panel: heatmap, tribes, activity, stream)
 * mapView → enterprise-insights-heatmap-grid.png (Click Map with layers)
 * vibeRadar → enterprise-insights-environment.png (Vibe Radar tab — filename is misleading)
 */
export const ENTERPRISE_SCREENSHOTS = {
  overview: '/landing/enterprise-insights-overview.png',
  environment: '/landing/enterprise-insights-map-view.png',
  heatmapGrid: '/landing/enterprise-vibe-radar.png',
  // mapView: '/landing/enterprise-insights-heatmap-grid.png',
  vibeRadar: '/landing/enterprise-insights-environment.png',
} as const;

type EnterpriseProductShotProps = {
  id: string;
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  sizes?: string;
};

export default function EnterpriseProductShot({
  id,
  src,
  alt,
  caption,
  className = '',
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1152px',
}: EnterpriseProductShotProps) {
  return (
    <motion.figure
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5 }}
      className={`overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-900/40 shadow-xl shadow-black/30 backdrop-blur-sm ${className}`}
    >
      <div className="relative aspect-[1024/640] w-full md:aspect-[16/9]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover object-top"
        />
      </div>
      {caption ? (
        <figcaption className="border-t border-zinc-800/80 px-4 py-3 text-center text-xs text-zinc-500 md:text-sm">
          {caption}
        </figcaption>
      ) : null}
    </motion.figure>
  );
}
