/**
 * Pulse questions, summary and pattern (§4.3, §4.5). No display thresholds: every reading is
 * returned with its sample size and age; `confidence` is descriptive only and never hides data.
 */

import { categoryQuestionKey } from '@/lib/places/categories';
import type { PlacesConfig } from '@/lib/places/config';
import { localParts } from '@/lib/places/hours';
import type {
  CategoryQuestionKey,
  EnergyLabel,
  PlaceCategory,
  PulsePattern,
  PulseQuestion,
  PulseRow,
  PulseSummary,
} from '@/lib/places/types';

export const PULSE_QUESTIONS_VERSION = 1;

const ENERGY_LABELS: readonly EnergyLabel[] = ['chill', 'steady', 'lively', 'packed'] as const;

const ENERGY_QUESTION: PulseQuestion = {
  key: 'energy',
  prompt: "How's the energy?",
  required: true,
  phase: 'present',
  options: [
    { value: 1, label: 'Chill' },
    { value: 2, label: 'Steady' },
    { value: 3, label: 'Lively' },
    { value: 4, label: 'Packed' },
  ],
};

const CATEGORY_QUESTIONS: Record<CategoryQuestionKey, PulseQuestion> = {
  seats: {
    key: 'category',
    category_question: 'seats',
    prompt: 'Seats available?',
    required: false,
    phase: 'present',
    options: [
      { value: 1, label: 'Plenty' },
      { value: 2, label: 'Some' },
      { value: 3, label: 'None' },
    ],
  },
  line: {
    key: 'category',
    category_question: 'line',
    prompt: 'Line at the door?',
    required: false,
    phase: 'present',
    options: [
      { value: 1, label: 'None' },
      { value: 2, label: 'Short' },
      { value: 3, label: 'Long' },
    ],
  },
  wait: {
    key: 'category',
    category_question: 'wait',
    prompt: 'Wait for a table?',
    required: false,
    phase: 'present',
    options: [
      { value: 1, label: 'None' },
      { value: 2, label: 'Short' },
      { value: 3, label: 'Long' },
    ],
  },
  equipment: {
    key: 'category',
    category_question: 'equipment',
    prompt: 'Wait for equipment?',
    required: false,
    phase: 'present',
    options: [
      { value: 1, label: 'None' },
      { value: 2, label: 'Some' },
      { value: 3, label: 'Long' },
    ],
  },
};

const TALKABLE_QUESTION: PulseQuestion = {
  key: 'talkable',
  prompt: 'Easy to talk here?',
  required: false,
  phase: 'present',
  options: [
    { value: 1, label: 'Yes' },
    { value: 0, label: 'No' },
  ],
};

const WOULD_RETURN_QUESTION: PulseQuestion = {
  key: 'would_return',
  prompt: 'Come back at this time?',
  required: false,
  phase: 'leaving',
  options: [
    { value: 1, label: 'Yes' },
    { value: 0, label: 'No' },
  ],
};

function cloneQuestion(q: PulseQuestion): PulseQuestion {
  return { ...q, options: q.options.map((o) => ({ ...o })) };
}

/** All questions for a category: present (energy, category?, talkable) then leaving (would_return). */
export function pulseQuestionsFor(category: PlaceCategory | null | undefined): PulseQuestion[] {
  const out = [cloneQuestion(ENERGY_QUESTION)];
  const cq = categoryQuestionKey(category);
  if (cq) out.push(cloneQuestion(CATEGORY_QUESTIONS[cq]));
  out.push(cloneQuestion(TALKABLE_QUESTION), cloneQuestion(WOULD_RETURN_QUESTION));
  return out;
}

export function energyLabel(score: number): EnergyLabel {
  if (score < 1.75) return 'chill';
  if (score < 2.5) return 'steady';
  if (score < 3.25) return 'lively';
  return 'packed';
}

function labelForEnergy(energy: number): EnergyLabel | null {
  return ENERGY_LABELS[energy - 1] ?? null;
}

function isEnergy(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4;
}

/**
 * `pulses`: rows for one Place covering at least the lookback window, already excluding the
 * Place's managers. Would-return-only rows (no energy) are ignored; talkable and category answers
 * are counted from the energy rows they ride on.
 */
export function summarizePulse(
  pulses: PulseRow[],
  nowMs: number,
  config: Pick<PlacesConfig, 'pulseWindowMinutes' | 'pulseHalfLifeMinutes' | 'lastPulseLookbackHours'>,
): PulseSummary {
  const windowStart = nowMs - config.pulseWindowMinutes * 60_000;
  const lookbackStart = nowMs - config.lastPulseLookbackHours * 3_600_000;

  const energyRows = pulses
    .filter((p) => isEnergy(p.energy))
    .map((p) => ({ ...p, at: Date.parse(p.created_at) }))
    .filter((p) => Number.isFinite(p.at) && p.at <= nowMs + 60_000)
    .sort((a, b) => b.at - a.at);

  const inWindow = energyRows.filter((p) => p.at >= windowStart);
  const distribution: [number, number, number, number] = [0, 0, 0, 0];
  const talkable = { yes: 0, no: 0 };
  let category: PulseSummary['category'] = null;

  let sumW = 0;
  let sumWE = 0;
  for (const p of inWindow) {
    const energy = p.energy as number;
    distribution[energy - 1] += 1;
    const ageMin = Math.max(0, (nowMs - p.at) / 60_000);
    const w = p.proof_weight * 0.5 ** (ageMin / config.pulseHalfLifeMinutes);
    sumW += w;
    sumWE += w * energy;
    if (p.talkable === 1) talkable.yes += 1;
    else if (p.talkable === 0) talkable.no += 1;
    if (p.category_question && isCategoryAnswer(p.category_answer)) {
      if (!category) category = { question: p.category_question, counts: [0, 0, 0] };
      if (category.question === p.category_question) category.counts[p.category_answer - 1] += 1;
    }
  }

  const base = { distribution, talkable, category, window_minutes: config.pulseWindowMinutes };

  if (inWindow.length > 0 && sumW > 0) {
    const score = sumWE / sumW;
    const n = inWindow.length;
    const confidence = n >= 8 && sumW >= 4 ? 'high' : n >= 3 && sumW >= 1.5 ? 'medium' : 'low';
    return {
      state: 'live',
      label: energyLabel(score),
      energy_score: Math.round(score * 100) / 100,
      report_count: n,
      newest_at: new Date(inWindow[0].at).toISOString(),
      confidence,
      ...base,
    };
  }

  const newest = energyRows.find((p) => p.at >= lookbackStart);
  if (newest) {
    return {
      state: 'stale',
      label: labelForEnergy(newest.energy as number),
      energy_score: null,
      report_count: 0,
      newest_at: new Date(newest.at).toISOString(),
      confidence: null,
      ...base,
    };
  }

  return {
    state: 'none',
    label: null,
    energy_score: null,
    report_count: 0,
    newest_at: null,
    confidence: null,
    ...base,
  };
}

function isCategoryAnswer(n: unknown): n is 1 | 2 | 3 {
  return n === 1 || n === 2 || n === 3;
}

/**
 * "Usually {label} around now": energy Pulses from the last `patternWeeks × 7` days on today's
 * local weekday within ±1 local hour. Unweighted mean; a single report still counts.
 */
export function pulsePattern(
  pulses: PulseRow[],
  timezone: string,
  nowMs: number,
  patternWeeks: number,
): PulsePattern | null {
  const now = localParts(timezone, nowMs);
  const since = nowMs - patternWeeks * 7 * 86_400_000;
  let n = 0;
  let sum = 0;
  for (const p of pulses) {
    if (!isEnergy(p.energy)) continue;
    const at = Date.parse(p.created_at);
    if (!Number.isFinite(at) || at < since || at > nowMs) continue;
    const local = localParts(timezone, at);
    if (local.weekday !== now.weekday) continue;
    if (Math.abs(local.hour - now.hour) > 1) continue;
    n += 1;
    sum += p.energy;
  }
  if (n === 0) return null;
  return { label: energyLabel(sum / n), report_count: n, weeks: patternWeeks };
}
