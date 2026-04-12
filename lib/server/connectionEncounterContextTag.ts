export type ContextTagPayload = {
  id: string;
  label: string;
  emoji: string;
};

export function normalizeContextTag(input: unknown): ContextTagPayload | null {
  if (typeof input === 'string') {
    const label = input.trim();
    return label ? { id: 'custom', label, emoji: '✏️' } : null;
  }

  if (
    input &&
    typeof input === 'object' &&
    'id' in input &&
    'label' in input &&
    typeof input.id === 'string' &&
    typeof input.label === 'string'
  ) {
    const candidate = input as { id: string; label: string; emoji?: unknown };
    return {
      id: candidate.id,
      label: candidate.label,
      emoji: typeof candidate.emoji === 'string' ? candidate.emoji : '✏️',
    };
  }

  return null;
}

export function resolveContextTagId(contextTag: ContextTagPayload | null): string | null {
  if (!contextTag) {
    return null;
  }

  return contextTag.id === 'custom' ? contextTag.label : contextTag.id;
}

export function normalizeNoiseLevelCategory(
  value: unknown,
): 'VERY_QUIET' | 'QUIET' | 'MODERATE' | 'LOUD' | 'VERY_LOUD' | null {
  return value === 'VERY_QUIET' ||
    value === 'QUIET' ||
    value === 'MODERATE' ||
    value === 'LOUD' ||
    value === 'VERY_LOUD'
    ? value
    : null;
}

/** Client `context_tags` / `contextTags` payloads: non-empty trimmed strings only, deduped. */
export function normalizeContextTagsArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (typeof item === 'string') {
      const t = item.trim();
      if (t.length > 0) out.push(t);
    }
  }
  return [...new Set(out)];
}
