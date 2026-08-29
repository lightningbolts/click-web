'use client';

import { CloudSun, Sparkles, Volume2 } from 'lucide-react';
import type { NoiseLevelKey } from '@/lib/dashboard/connectionExtras';
import { noiseLevelToBarCount } from '@/lib/dashboard/connectionExtras';

/**
 * Signal-style bars: 1 = quiet, 2 = moderate, 3 = loud / very loud
 */
export function NoiseVolumeBars({
  activeCount,
  compact,
}: {
  activeCount: 1 | 2 | 3;
  compact?: boolean;
}) {
  const heightsPx = compact ? [4, 7, 10] : [6, 10, 14];
  const barW = compact ? 'w-[2.5px]' : 'w-[3px]';
  return (
    <span
      className={`inline-flex items-end gap-0.5 shrink-0 ${compact ? 'h-3.5' : 'h-4'}`}
      aria-hidden
      title="Noise level"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${barW} rounded-sm ${
            i < activeCount ? 'bg-violet-400' : 'bg-zinc-600/80'
          }`}
          style={{ height: heightsPx[i] }}
        />
      ))}
    </span>
  );
}

export function NoiseVolumeBarsForCategory({
  category,
  compact,
}: {
  category?: NoiseLevelKey;
  compact?: boolean;
}) {
  if (!category) return null;
  return (
    <NoiseVolumeBars activeCount={noiseLevelToBarCount(category)} compact={compact} />
  );
}

type MomentBlockProps = {
  context?: string;
  weatherSummary?: string;
  noiseSummary?: string;
  noiseCategory?: NoiseLevelKey;
  /** When true, use tighter spacing for dense layouts (e.g. chat header) */
  compact?: boolean;
};

/**
 * Shared “memory moment” block: event, weather (°F), noise with tiered bars.
 */
export function MomentBlock({
  context,
  weatherSummary,
  noiseSummary,
  noiseCategory,
  compact,
}: MomentBlockProps) {
  const hasAny = Boolean(context || weatherSummary || noiseSummary);
  if (!hasAny) {
    return null;
  }

  const gap = compact ? 'gap-1.5' : 'gap-2';
  const textMain = compact
    ? 'text-xs text-on-surface leading-snug'
    : 'text-sm text-on-surface leading-snug';

  return (
    <div className={`flex flex-col ${gap}`}>
      {context && (
        <div className="flex gap-2 items-start min-w-0">
          <Sparkles
            className={`shrink-0 text-amber-800 dark:text-amber-300/95 mt-0.5 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
          />
          <span className={`min-w-0 truncate ${textMain}`} title={context}>{context}</span>
        </div>
      )}
      {weatherSummary && (
        <div className="flex gap-2 items-center min-w-0">
          <CloudSun
            className={`shrink-0 text-sky-300 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
          />
          <span className={`min-w-0 truncate ${textMain}`} title={weatherSummary}>{weatherSummary}</span>
        </div>
      )}
      {noiseSummary && (
        <div className="flex gap-2 items-center min-w-0">
          {noiseCategory ? (
            <NoiseVolumeBarsForCategory category={noiseCategory} compact={compact} />
          ) : (
            <Volume2
              className={`shrink-0 text-primary ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`}
            />
          )}
          <span className={`min-w-0 truncate ${textMain}`} title={noiseSummary}>{noiseSummary}</span>
        </div>
      )}
    </div>
  );
}
