/** Shared Places copy (§4.11). iOS re-implements these strings; keep them identical. */

import type { EnergyLabel, PulsePattern, PulseSummary } from '@/lib/places/types';

export const NO_PULSE_COPY = "No Pulse yet — be the first when you're here";

export function energyTitle(label: EnergyLabel): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function ageLabel(iso: string | null, nowMs: number): string {
  if (!iso) return '';
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function pulseLine(pulse: PulseSummary, nowMs: number): string {
  if (pulse.state === 'live' && pulse.label) {
    return `${energyTitle(pulse.label)} · ${plural(pulse.report_count, 'report')} · ${ageLabel(pulse.newest_at, nowMs)}`;
  }
  if (pulse.state === 'stale' && pulse.label) {
    return `Last Pulse: ${energyTitle(pulse.label)} · ${ageLabel(pulse.newest_at, nowMs)}`;
  }
  return NO_PULSE_COPY;
}

export function confidenceChip(confidence: PulseSummary['confidence']): string | null {
  if (confidence === 'high') return 'Strong read';
  if (confidence === 'medium') return 'Fair read';
  if (confidence === 'low') return 'Early read';
  return null;
}

export function patternLine(pattern: PulsePattern): string {
  return `Usually ${energyTitle(pattern.label)} around now · ${plural(pattern.report_count, 'report')} over ${pattern.weeks} weeks`;
}

/** `null` when nobody is here (the row is hidden). */
export function hereNowLine(count: number): string | null {
  return count > 0 ? `${count} here now` : null;
}
